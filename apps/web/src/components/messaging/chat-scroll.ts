export type ScrollAction =
  { type: 'scroll-to-bottom' } | { type: 'preserve-scroll'; diff: number } | { type: 'none' };

export interface MessageListChange {
  isInitialLoad: boolean;
  isPrepended: boolean;
  isAppended: boolean;
}

export function detectMessageListChange(prevIds: string[], nextIds: string[]): MessageListChange {
  if (prevIds.length === 0 && nextIds.length > 0) {
    return { isInitialLoad: true, isPrepended: false, isAppended: false };
  }
  if (prevIds.length === 0 && nextIds.length === 0) {
    return { isInitialLoad: false, isPrepended: false, isAppended: false };
  }

  const isPrepended = nextIds.length > 0 && nextIds[0] !== prevIds[0];
  const isAppended =
    nextIds.length > 0 && nextIds[nextIds.length - 1] !== prevIds[prevIds.length - 1];

  return { isInitialLoad: false, isPrepended, isAppended };
}

export interface ScrollDecisionParams {
  isInitialLoad: boolean;
  isPrepended: boolean;
  isAppended: boolean;
  isNearBottom: boolean;
  prevScrollHeight: number;
  currentScrollHeight: number;
}

export function computeChatScrollAction(params: ScrollDecisionParams): ScrollAction {
  if (params.isInitialLoad) {
    return { type: 'scroll-to-bottom' };
  }

  const diff = params.currentScrollHeight - params.prevScrollHeight;

  // Older messages prepended at the top: preserve viewport reading position
  if (params.isPrepended && !params.isAppended) {
    if (diff > 0) {
      return { type: 'preserve-scroll', diff };
    }
    return { type: 'none' };
  }

  // New message appended at the bottom
  if (params.isAppended) {
    if (params.isNearBottom) {
      return { type: 'scroll-to-bottom' };
    }
    // Scrolled up reading history: do not jump
    return { type: 'none' };
  }

  return { type: 'none' };
}

export function isScrolledNearBottom(
  el: { scrollHeight: number; scrollTop: number; clientHeight: number },
  threshold = 60,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}
