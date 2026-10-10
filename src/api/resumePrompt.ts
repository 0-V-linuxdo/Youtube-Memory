// Bridge between the progress engine and the "where to continue?" dialog (N-3) owned by PlayerBadge.

export type ResumeChoice = 'saved' | 'link';

export interface ResumePromptOptions {
  videoId: string;
  saved: number;
  link: number;
}

export interface ResumePromptHandle {
  result: Promise<ResumeChoice>;
  /** Close the dialog without a choice (navigation away). */
  cancel(): void;
}

type Impl = (opts: ResumePromptOptions) => ResumePromptHandle;

let impl: Impl | null = null;

export function setResumePromptImpl(fn: Impl | null): void {
  impl = fn;
}

/** Ask the user. Without a dialog implementation the link time wins (same as pressing Esc). */
export function askResume(opts: ResumePromptOptions): ResumePromptHandle {
  if (impl) return impl(opts);
  return { result: Promise.resolve('link'), cancel() { /* nothing to close */ } };
}
