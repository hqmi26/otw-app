import { APP_VERSION } from './models';

export type FeedbackKind = 'idea' | 'bug' | 'other';

export const FEEDBACK_KINDS: { kind: FeedbackKind; label: string; question: string; placeholder: string }[] = [
  {
    kind: 'idea',
    label: 'Idea',
    question: 'What should OTW do?',
    placeholder: 'e.g. Show petrol stations along my route',
  },
  {
    kind: 'bug',
    label: 'Bug',
    question: 'What went wrong?',
    placeholder: 'What you were doing, and what happened instead',
  },
  {
    kind: 'other',
    label: 'Other',
    question: 'Your message',
    placeholder: 'Anything you’d like to say',
  },
];

/**
 * Saves the message on the OTW server (functions/api/feedback.ts), with the
 * phone details that help track down a bug. No location is sent.
 */
export async function sendFeedback(kind: FeedbackKind, message: string, from: string): Promise<void> {
  const installed = window.matchMedia('(display-mode: standalone)').matches;
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind,
      message,
      name: from,
      app: `${APP_VERSION} (${installed ? 'home screen app' : 'browser'})`,
      screen: `${window.innerWidth}×${window.innerHeight}`,
      device: navigator.userAgent,
    }),
  });
  if (!res.ok) throw new Error(`Feedback not saved (${res.status})`);
}
