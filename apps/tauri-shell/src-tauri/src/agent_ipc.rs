use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentResponse {
    Ready { timestamp: i64 },
    Token { id: String, token: String, timestamp: i64 },
    ToolUse { id: String, data: serde_json::Value, timestamp: i64 },
    ToolResult { id: String, data: serde_json::Value, timestamp: i64 },
    Done { id: String, #[serde(skip_serializing_if = "Option::is_none")] data: Option<serde_json::Value>, timestamp: i64 },
    Error { id: String, error: String, timestamp: i64 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRequest {
    pub id: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub images: Option<String>, // JSON string of image attachments
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,
}

pub struct AgentProcess {
    #[allow(dead_code)]
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
}

impl AgentProcess {
    pub async fn spawn(app_handle: AppHandle) -> Result<Self> {
        // Get the path to the agent runtime
        let agent_path = std::env::current_dir()
            .context("Failed to get current directory")?
            .join("../../agent-runtime");

        eprintln!("[DEBUG] Spawning agent process from: {:?}", agent_path);

        // Spawn the agent runtime process
        let mut child = Command::new("npx")
            .arg("tsx")
            .arg("src/index.ts")
            .current_dir(&agent_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .context("Failed to spawn agent process")?;

        let stdout = child.stdout.take().context("Failed to get stdout")?;
        let stderr = child.stderr.take().context("Failed to get stderr")?;
        let stdin = child.stdin.take().context("Failed to get stdin")?;

        // Spawn task to read stdout and emit events
        // Use byte-based reading to handle large JSON payloads (like base64 images)
        let app_handle_clone = app_handle.clone();
        tokio::spawn(async move {
            let mut stdout = stdout;
            let mut buffer = Vec::with_capacity(512 * 1024); // 512KB initial capacity
            let mut chunk = vec![0u8; 8192]; // 8KB read chunks
            const MAX_MESSAGE_SIZE: usize = 10 * 1024 * 1024; // 10MB max per message

            loop {
                match stdout.read(&mut chunk).await {
                    Ok(0) => {
                        // EOF - process exited
                        eprintln!("[AGENT] stdout stream ended (process exited)");
                        break;
                    }
                    Ok(n) => {
                        // Append new data to buffer
                        buffer.extend_from_slice(&chunk[..n]);

                        // Process complete lines (terminated by \n)
                        while let Some(newline_pos) = buffer.iter().position(|&b| b == b'\n') {
                            // Extract line bytes (including the newline)
                            let line_bytes: Vec<u8> = buffer.drain(..=newline_pos).collect();

                            // Convert to UTF-8 string
                            let line = match String::from_utf8(line_bytes) {
                                Ok(s) => s.trim().to_string(),
                                Err(e) => {
                                    eprintln!("[ERROR] Invalid UTF-8 in stdout: {}", e);
                                    continue;
                                }
                            };

                            if line.is_empty() {
                                continue;
                            }

                            eprintln!("[AGENT STDOUT] {}", line);

                            // Try to parse as agent response (JSON protocol)
                            match serde_json::from_str::<AgentResponse>(&line) {
                                Ok(response) => {
                                    // This is a JSON protocol message, emit as agent_response
                                    if let Err(e) = app_handle_clone.emit_all("agent_response", &response) {
                                        eprintln!("Failed to emit agent response: {}", e);
                                    }
                                }
                                Err(_) => {
                                    // Not JSON, treat as a regular log message (like [INFO] lines)
                                    let timestamp = std::time::SystemTime::now()
                                        .duration_since(std::time::UNIX_EPOCH)
                                        .unwrap()
                                        .as_millis() as i64;

                                    let log_event = serde_json::json!({
                                        "source": "stdout",
                                        "message": line,
                                        "timestamp": timestamp
                                    });

                                    if let Err(e) = app_handle_clone.emit_all("agent_log", &log_event) {
                                        eprintln!("Failed to emit agent log: {}", e);
                                    }
                                }
                            }
                        }

                        // Check buffer size to prevent unbounded growth
                        if buffer.len() > MAX_MESSAGE_SIZE {
                            eprintln!(
                                "[ERROR] Message buffer exceeded {} bytes without newline - clearing buffer",
                                MAX_MESSAGE_SIZE
                            );
                            buffer.clear();
                        }
                    }
                    Err(e) => {
                        // Error reading from stream
                        eprintln!("[ERROR] Failed to read from agent stdout: {}", e);
                        // Don't break - keep trying in case it's transient
                    }
                }
            }

            eprintln!("[AGENT] stdout reader task exiting");
        });

        // Spawn task to read stderr for debugging
        // Use same byte-based reading as stdout for consistency
        let app_handle_stderr = app_handle.clone();
        tokio::spawn(async move {
            let mut stderr = stderr;
            let mut buffer = Vec::with_capacity(64 * 1024); // 64KB for stderr
            let mut chunk = vec![0u8; 4096]; // 4KB chunks for stderr

            loop {
                match stderr.read(&mut chunk).await {
                    Ok(0) => {
                        eprintln!("[AGENT] stderr stream ended (process exited)");
                        break;
                    }
                    Ok(n) => {
                        buffer.extend_from_slice(&chunk[..n]);

                        while let Some(newline_pos) = buffer.iter().position(|&b| b == b'\n') {
                            let line_bytes: Vec<u8> = buffer.drain(..=newline_pos).collect();

                            let line = match String::from_utf8(line_bytes) {
                                Ok(s) => s.trim().to_string(),
                                Err(e) => {
                                    eprintln!("[ERROR] Invalid UTF-8 in stderr: {}", e);
                                    continue;
                                }
                            };

                            if line.is_empty() {
                                continue;
                            }

                            eprintln!("[AGENT STDERR] {}", line);

                            let timestamp = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap()
                                .as_millis() as i64;

                            let log_event = serde_json::json!({
                                "source": "stderr",
                                "message": line,
                                "timestamp": timestamp
                            });

                            if let Err(e) = app_handle_stderr.emit_all("agent_log", &log_event) {
                                eprintln!("Failed to emit agent log: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[ERROR] Failed to read from agent stderr: {}", e);
                    }
                }
            }

            eprintln!("[AGENT] stderr reader task exiting");
        });

        Ok(AgentProcess {
            child,
            stdin: Arc::new(Mutex::new(stdin)),
        })
    }

    pub async fn send_request(&self, request: &AgentRequest) -> Result<()> {
        let json = serde_json::to_string(request).context("Failed to serialize request")?;
        let mut stdin = self.stdin.lock().await;

        // Write request with proper error handling for broken pipe
        if let Err(e) = stdin.write_all(json.as_bytes()).await {
            if e.kind() == std::io::ErrorKind::BrokenPipe {
                eprintln!("[ERROR] Agent process stdin closed (broken pipe)");
                return Err(anyhow::anyhow!("Agent process stdin closed"));
            }
            return Err(anyhow::Error::from(e).context("Failed to write to stdin"));
        }

        if let Err(e) = stdin.write_all(b"\n").await {
            if e.kind() == std::io::ErrorKind::BrokenPipe {
                eprintln!("[ERROR] Agent process stdin closed (broken pipe)");
                return Err(anyhow::anyhow!("Agent process stdin closed"));
            }
            return Err(anyhow::Error::from(e).context("Failed to write newline"));
        }

        if let Err(e) = stdin.flush().await {
            if e.kind() == std::io::ErrorKind::BrokenPipe {
                eprintln!("[ERROR] Agent process stdin closed (broken pipe)");
                return Err(anyhow::anyhow!("Agent process stdin closed"));
            }
            return Err(anyhow::Error::from(e).context("Failed to flush stdin"));
        }

        eprintln!("[SENT TO AGENT] {}", json);

        Ok(())
    }
}
