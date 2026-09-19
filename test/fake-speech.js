// Stands in for vendor/speech.js in the tests. Models only the parts of the
// Azure Speech SDK that app.js touches - including the detail the barge-in
// test depends on: a PAUSED SpeakerAudioDestination never fires onAudioEnd,
// because the real one hangs that callback off <audio>.onended, and a paused
// element never ends. (SpeakerAudioDestination.notifyPlayback.)
//
// window.__voice is the control surface: say() delivers an utterance to a
// waiting recognizeOnceAsync, bargeIn() talks over the agent through the
// continuous watcher, and spoken[] records everything the page tried to say.
(function () {
  const log = [];
  const state = {
    pendingOnce: null,      // resolver waiting in recognizeOnceAsync
    watchers: new Set(),    // continuous recognizers
    spoken: [],             // {text, lang, voice, ended, interrupted}
    speakMs: 300
  };

  class SpeakerAudioDestination {
    constructor() { this.onAudioEnd = null; this.closed = false; this.paused = false; this._timer = null; }
    pause() { this.paused = true; if (this._entry) this._entry.interrupted = true; if (this._timer) { clearTimeout(this._timer); this._timer = null; } }
    close() { this.closed = true; }
  }

  const SpeechSDK = {
    PropertyId: { Speech_SegmentationSilenceTimeoutMs: "SegSilence" },
    ResultReason: { RecognizedSpeech: 3, NoMatch: 0 },
    SpeechConfig: {
      fromAuthorizationToken(token, region) {
        return { token, region, props: {}, speechSynthesisVoiceName: null,
                 setProperty(k, v) { this.props[k] = v; } };
      }
    },
    AutoDetectSourceLanguageConfig: { fromLanguages: langs => ({ langs }) },
    AutoDetectSourceLanguageResult: { fromResult: r => ({ language: r.language }) },
    AudioConfig: {
      fromDefaultMicrophoneInput: () => ({ kind: "mic" }),
      fromSpeakerOutput: p => ({ kind: "speaker", player: p })
    },
    SpeakerAudioDestination,
    SpeechRecognizer: {
      FromConfig(cfg, langs, audio) {
        const rec = {
          cfg, langs, audio, closed: false,
          recognizing: null, recognized: null, continuous: false,
          recognizeOnceAsync(cb, err) {
            log.push("recognizeOnce");
            state.pendingOnce = { cb, err, rec };
          },
          startContinuousRecognitionAsync(cb) {
            rec.continuous = true; state.watchers.add(rec); log.push("watcher:start"); if (cb) cb();
          },
          stopContinuousRecognitionAsync(cb) {
            rec.continuous = false; state.watchers.delete(rec); log.push("watcher:stop"); if (cb) cb();
          },
          close() { rec.closed = true; state.watchers.delete(rec); log.push("recognizer:close"); }
        };
        return rec;
      }
    },
    SpeechSynthesizer: function (cfg, audioConfig) {
      const player = audioConfig.player;
      this.speakTextAsync = function (text, ok, err) {
        const entry = { text, lang: cfg.speechSynthesisVoiceName, ended: false, interrupted: false };
        state.spoken.push(entry);
        player._entry = entry;
        if (ok) ok();                              // synthesis done; audio still playing
        player._timer = setTimeout(() => {
          player._timer = null;
          if (player.paused) { entry.interrupted = true; return; }   // paused => no onended
          entry.ended = true;
          if (player.onAudioEnd) player.onAudioEnd(player);
        }, state.speakMs);
      };
      this.close = function () { log.push("synth:close"); };
    }
  };

  // ---- test control surface ----
  window.__voice = {
    log, state,
    get spoken() { return state.spoken; },
    setSpeakMs(ms) { state.speakMs = ms; },
    // deliver a single-shot utterance to a waiting recognizeOnceAsync
    say(text, language = "en-US") {
      const p = state.pendingOnce;
      if (!p) return "NO_LISTENER";
      state.pendingOnce = null;
      p.cb({ reason: SpeechSDK.ResultReason.RecognizedSpeech, text, language });
      return "ok";
    },
    sayNothing() {
      const p = state.pendingOnce;
      if (!p) return "NO_LISTENER";
      state.pendingOnce = null;
      p.cb({ reason: SpeechSDK.ResultReason.NoMatch, text: "", language: "en-US" });
      return "ok";
    },
    // speak over the agent: partials then a final, to the continuous watchers
    bargeIn(text, language = "en-US") {
      if (!state.watchers.size) return "NO_WATCHER";
      for (const w of state.watchers) {
        if (w.recognizing) w.recognizing(w, { result: { text } });
        setTimeout(() => {
          if (w.recognized) w.recognized(w, { result: { reason: SpeechSDK.ResultReason.RecognizedSpeech, text, language } });
        }, 20);
      }
      return "ok";
    },
    waitingForSpeech() { return !!state.pendingOnce; },
    watcherCount() { return state.watchers.size; }
  };

  window.SpeechSDK = SpeechSDK;
})();
