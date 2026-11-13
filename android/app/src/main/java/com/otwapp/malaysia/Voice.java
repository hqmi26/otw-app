package com.otwapp.malaysia;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;
import java.util.Locale;

/**
 * Speaks directions with the phone's own voice. An Android app's pages have no
 * voice of their own, so the website's way of speaking doesn't work here.
 *
 * It speaks as navigation guidance: music gets quieter while a line is said and
 * comes back after, the same as other navigation apps.
 */
class Voice implements TextToSpeech.OnInitListener {

    /** Told once per line: true when it was said to the end, false when it was cut off or failed. */
    interface Done {
        void finished(boolean said);
    }

    private static final String TAG = "OtwVoice";

    private final AudioManager audio;
    private final TextToSpeech tts;
    private final AudioAttributes guidance = new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build();
    private final AudioManager.OnAudioFocusChangeListener onFocus = change -> {};
    private AudioFocusRequest focus;

    private boolean ready;
    private boolean failed;
    private int counter;
    /** The line being said now. */
    private String currentId;
    private Done currentDone;
    /** A line asked for before the voice finished starting up. */
    private String waitingText;
    private String waitingLang;
    private Done waitingDone;

    Voice(Context context) {
        audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        tts = new TextToSpeech(context.getApplicationContext(), this);
        tts.setOnUtteranceProgressListener(
            new UtteranceProgressListener() {
                @Override
                public void onStart(String id) {
                    Log.i(TAG, "saying " + id);
                }

                @Override
                public void onDone(String id) {
                    end(id, true);
                }

                @Override
                public void onError(String id) {
                    end(id, false);
                }

                @Override
                public void onError(String id, int code) {
                    Log.w(TAG, "could not say " + id + ", code " + code);
                    end(id, false);
                }

                @Override
                public void onStop(String id, boolean interrupted) {
                    end(id, false);
                }
            }
        );
    }

    @Override
    public synchronized void onInit(int status) {
        ready = status == TextToSpeech.SUCCESS;
        failed = !ready;
        Log.i(TAG, ready ? "voice ready" : "this phone has no voice engine");
        if (ready) tts.setAudioAttributes(guidance);
        if (waitingText == null) return;
        String text = waitingText;
        String lang = waitingLang;
        Done done = waitingDone;
        waitingText = null;
        waitingDone = null;
        speak(text, lang, done);
    }

    /** Says the line now, cutting off anything still being said. */
    synchronized void speak(String text, String lang, Done done) {
        if (failed) {
            done.finished(false);
            return;
        }
        if (!ready) {
            if (waitingDone != null) waitingDone.finished(false);
            waitingText = text;
            waitingLang = lang;
            waitingDone = done;
            return;
        }
        finishCurrent(false);
        tts.setLanguage(pickLocale(lang));
        currentId = "line-" + (++counter);
        currentDone = done;
        holdFocus();
        Bundle params = new Bundle();
        if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, currentId) != TextToSpeech.SUCCESS) finishCurrent(false);
    }

    synchronized void stop() {
        if (waitingDone != null) waitingDone.finished(false);
        waitingText = null;
        waitingDone = null;
        finishCurrent(false);
        if (ready) tts.stop();
    }

    void shutdown() {
        stop();
        tts.shutdown();
    }

    private synchronized void end(String id, boolean said) {
        if (id != null && id.equals(currentId)) finishCurrent(said);
    }

    private void finishCurrent(boolean said) {
        Done done = currentDone;
        currentId = null;
        currentDone = null;
        if (done == null) return;
        releaseFocus();
        done.finished(said);
    }

    /** Malay, then Indonesian (close enough to be understood), then whatever the phone has. */
    private Locale pickLocale(String lang) {
        Locale[] wanted = "ms".equals(lang)
            ? new Locale[] { new Locale("ms", "MY"), new Locale("id", "ID") }
            : new Locale[] { new Locale("en", "MY"), Locale.UK, Locale.US };
        for (Locale locale : wanted) {
            if (tts.isLanguageAvailable(locale) >= TextToSpeech.LANG_AVAILABLE) return locale;
        }
        return Locale.getDefault();
    }

    private void holdFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focus == null) {
                focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(guidance)
                    .setOnAudioFocusChangeListener(onFocus)
                    .build();
            }
            audio.requestAudioFocus(focus);
        } else {
            audio.requestAudioFocus(onFocus, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
        }
    }

    private void releaseFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focus != null) audio.abandonAudioFocusRequest(focus);
        } else {
            audio.abandonAudioFocus(onFocus);
        }
    }
}
