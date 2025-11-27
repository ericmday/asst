# Voice Interaction Features

> Hands-free voice input and text-to-speech output

## Overview

Add voice capabilities to enable:
- Hands-free interaction (speak questions)
- Audio responses (listen to answers)
- Accessibility improvements
- Multitasking while using assistant

---

## Voice Input (Speech-to-Text)

### Technology: Groq Whisper

**Model:** whisper-large-v3-turbo
**Speed:** ~5-10x faster than OpenAI
**Cost:** ~$0.111 per hour of audio
**Accuracy:** Near-perfect for English

### Architecture

```
User presses Cmd+T (or mic button)
    ↓
Record audio (browser MediaRecorder)
    ↓
Stop recording (release key or auto-detect silence)
    ↓
Send to Groq Whisper API
    ↓
Receive transcription
    ↓
Insert into input field
    ↓
Auto-submit (optional)
```

### Implementation

```typescript
// apps/tauri-shell/src/hooks/useVoiceInput.ts

export function useVoiceInput() {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = async () => {
      const audioBlob = new Blob(chunks, { type: 'audio/webm' });
      const text = await transcribe(audioBlob);
      onTranscription(text);
    };

    recorder.start();
    setIsRecording(true);
    mediaRecorder.current = recorder;
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    setIsRecording(false);
  };

  return { isRecording, startRecording, stopRecording };
}

async function transcribe(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', 'whisper-large-v3-turbo');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${groqApiKey}` },
    body: formData,
  });

  const data = await response.json();
  return data.text;
}
```

### UI Components

**Microphone button in input field:**
```tsx
<div className="relative">
  <Textarea ref={inputRef} />
  <Button
    variant="ghost"
    size="icon"
    className="absolute right-2 bottom-2"
    onMouseDown={startRecording}
    onMouseUp={stopRecording}
  >
    {isRecording ? (
      <MicOff className="text-red-500 animate-pulse" />
    ) : (
      <Mic className="text-gray-500" />
    )}
  </Button>
</div>
```

**Global hotkey (Cmd+T):**
```rust
// In main.rs
.global_shortcut("Cmd+T", move |app| {
  // Toggle recording
  app.emit_all("toggle-recording", {}).unwrap();
})
```

---

## Text-to-Speech

### Technology: ElevenLabs

**Quality:** Very high (natural voices)
**Cost:** ~$0.18 per 1k characters
**Voices:** 20+ options
**Latency:** ~500ms for short responses

### Architecture

```
AI completes response
    ↓
User clicks speaker icon (or auto-play)
    ↓
Send text to ElevenLabs API
    ↓
Receive audio stream
    ↓
Play through Web Audio API
```

### Implementation

```typescript
// apps/tauri-shell/src/hooks/useTextToSpeech.ts

export function useTextToSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);

  const speak = async (text: string, voice: string = 'Rachel') => {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${getVoiceId(voice)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': elevenLabsApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    audio.onplay = () => setIsSpeaking(true);
    audio.onended = () => {
      setIsSpeaking(false);
      URL.revokeObjectURL(audioUrl);
    };

    audio.play();
    setCurrentAudio(audio);
  };

  const stop = () => {
    currentAudio?.pause();
    setIsSpeaking(false);
  };

  return { isSpeaking, speak, stop };
}
```

### UI Components

```tsx
// Speaker button on each message
<Button
  variant="ghost"
  size="sm"
  onClick={() => speak(message.content)}
  disabled={isSpeaking}
>
  {isSpeaking ? <VolumeX /> : <Volume2 />}
</Button>

// Auto-read toggle in settings
<Switch
  checked={autoRead}
  onCheckedChange={setAutoRead}
  label="Auto-read responses"
/>
```

---

## Settings & Configuration

### Voice Input Settings
- Microphone selection
- Auto-submit after transcription
- Silence detection threshold
- Language selection

### TTS Settings
- Voice selection (Rachel, Adam, Bella, etc.)
- Speaking rate
- Auto-read toggle
- Volume control

### Storage

```typescript
interface VoiceSettings {
  input: {
    enabled: boolean;
    autoSubmit: boolean;
    silenceThreshold: number;
    language: string;
  };
  output: {
    enabled: boolean;
    autoRead: boolean;
    voice: string;
    rate: number;
    volume: number;
  };
}
```

---

## Implementation Timeline

### Week 1: Voice Input
**Day 1-2:** Core recording functionality
- Browser MediaRecorder integration
- Audio chunk handling
- Groq API integration

**Day 3-4:** UI & UX
- Microphone button
- Recording indicator
- Global hotkey
- Error handling

**Day 5:** Polish
- Silence detection
- Auto-submit option
- Permission handling
- Testing

### Week 2: Text-to-Speech (Optional)
**Day 1-2:** ElevenLabs integration
- API setup
- Audio playback
- Voice selection

**Day 3:** UI
- Speaker icons
- Voice picker
- Auto-read toggle

**Day 4-5:** Polish & testing

---

## User Flows

### Flow 1: Quick Voice Question
```
1. User presses Cmd+T
2. Speaks: "What's in my calendar today?"
3. Releases Cmd+T
4. Transcription appears in input
5. Auto-submits (if enabled)
6. AI responds with text
7. (Optional) Auto-reads response
```

### Flow 2: Long-form Dictation
```
1. User clicks mic button
2. Speaks multiple sentences
3. Clicks mic again to stop
4. Reviews transcription
5. Edits if needed
6. Manually sends
```

### Flow 3: Hands-free Mode
```
1. Enable auto-submit + auto-read
2. Press Cmd+T and speak
3. Release to submit
4. Listen to response while working
5. Press Cmd+T for follow-up
```

---

## Dependencies

**Rust (none - all browser-based):**
No new Rust dependencies needed.

**TypeScript:**
```json
{
  "devDependencies": {
    "@types/dom-mediacapture-record": "^1.0.16"
  }
}
```

**Environment variables:**
```bash
GROQ_API_KEY=gsk_...           # For Whisper
ELEVENLABS_API_KEY=...         # For TTS (optional)
```

---

## Testing

**Voice Input:**
- [ ] Recording in various noise conditions
- [ ] Multi-language support
- [ ] Permission handling (mic access)
- [ ] Silence detection accuracy
- [ ] Global hotkey conflicts

**Text-to-Speech:**
- [ ] Audio quality
- [ ] Playback interruption
- [ ] Voice switching
- [ ] Memory cleanup (audio blobs)

---

## Cost Estimates

**Heavy usage (1 hour/day of voice input):**
- Groq Whisper: ~$3.33/month
- ElevenLabs TTS: ~$5-10/month (10k characters/day)

**Total: ~$8-13/month for heavy voice usage**

---

## Accessibility Benefits

✅ Users with typing difficulties
✅ Vision-impaired users (TTS)
✅ Multitasking (hands-free)
✅ Faster input for long questions
✅ Listening while coding/writing

---

## Future Enhancements

- [ ] Offline TTS (Piper model)
- [ ] Offline STT (Whisper.cpp)
- [ ] Voice commands ("Hey assistant...")
- [ ] Wake word detection
- [ ] Multi-language support
- [ ] Custom voice cloning
