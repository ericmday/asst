use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentResponse {
    Ready { timestamp: i64 },
    Token { id: String, token: String, timestamp: i64 },
    ToolUse { id: String, data: serde_json::Value, timestamp: i64 },
    ToolResult { id: String, data: serde_json::Value, timestamp: i64 },
    Done { id: String, timestamp: i64 },
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
        let app_handle_clone = app_handle.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[AGENT STDOUT] {}", line);

                match serde_json::from_str::<AgentResponse>(&line) {
                    Ok(response) => {
                        if let Err(e) = app_handle_clone.emit_all("agent_response", &response) {
                            eprintln!("Failed to emit agent response: {}", e);
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to parse agent response: {} | Line: {}", e, line);
                    }
                }
            }
        });

        // Spawn task to read stderr for debugging
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[AGENT STDERR] {}", line);
            }
        });

        Ok(AgentProcess {
            child,
            stdin: Arc::new(Mutex::new(stdin)),
        })
    }

    pub async fn send_request(&self, request: &AgentRequest) -> Result<()> {
        let json = serde_json::to_string(request).context("Failed to serialize request")?;
        let mut stdin = self.stdin.lock().await;

        stdin
            .write_all(json.as_bytes())
            .await
            .context("Failed to write to stdin")?;
        stdin
            .write_all(b"\n")
            .await
            .context("Failed to write newline")?;
        stdin.flush().await.context("Failed to flush stdin")?;

        eprintln!("[SENT TO AGENT] {}", json);

        Ok(())
    }
}
