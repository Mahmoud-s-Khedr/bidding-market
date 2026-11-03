import { describe, expect, it } from 'vitest';
import {
  computeChatScrollAction,
  detectMessageListChange,
  isScrolledNearBottom,
} from './chat-scroll';

describe('chat-scroll', () => {
  describe('detectMessageListChange', () => {
    it('detects initial load when prevIds is empty and nextIds is non-empty', () => {
      const res = detectMessageListChange([], ['m1', 'm2']);
      expect(res).toEqual({
        isInitialLoad: true,
        isPrepended: false,
        isAppended: false,
      });
    });

    it('returns all false when both are empty', () => {
      const res = detectMessageListChange([], []);
      expect(res).toEqual({
        isInitialLoad: false,
        isPrepended: false,
        isAppended: false,
      });
    });

    it('detects prepended older page', () => {
      const res = detectMessageListChange(['m3', 'm4'], ['m1', 'm2', 'm3', 'm4']);
      expect(res).toEqual({
        isInitialLoad: false,
        isPrepended: true,
        isAppended: false,
      });
    });

    it('detects appended incoming message', () => {
      const res = detectMessageListChange(['m1', 'm2'], ['m1', 'm2', 'm3']);
      expect(res).toEqual({
        isInitialLoad: false,
        isPrepended: false,
        isAppended: true,
      });
    });

    it('detects unchanged message list', () => {
      const res = detectMessageListChange(['m1', 'm2'], ['m1', 'm2']);
      expect(res).toEqual({
        isInitialLoad: false,
        isPrepended: false,
        isAppended: false,
      });
    });
  });

  describe('computeChatScrollAction', () => {
    it('returns scroll-to-bottom on initial load', () => {
      const action = computeChatScrollAction({
        isInitialLoad: true,
        isPrepended: false,
        isAppended: false,
        isNearBottom: false,
        prevScrollHeight: 0,
        currentScrollHeight: 1200,
      });
      expect(action).toEqual({ type: 'scroll-to-bottom' });
    });

    it('returns scroll-to-bottom when message is appended and user is near bottom', () => {
      const action = computeChatScrollAction({
        isInitialLoad: false,
        isPrepended: false,
        isAppended: true,
        isNearBottom: true,
        prevScrollHeight: 1000,
        currentScrollHeight: 1100,
      });
      expect(action).toEqual({ type: 'scroll-to-bottom' });
    });

    it('returns none when message is appended but user is scrolled up (not near bottom)', () => {
      const action = computeChatScrollAction({
        isInitialLoad: false,
        isPrepended: false,
        isAppended: true,
        isNearBottom: false,
        prevScrollHeight: 1000,
        currentScrollHeight: 1100,
      });
      expect(action).toEqual({ type: 'none' });
    });

    it('returns preserve-scroll with diff when older messages are prepended', () => {
      const action = computeChatScrollAction({
        isInitialLoad: false,
        isPrepended: true,
        isAppended: false,
        isNearBottom: false,
        prevScrollHeight: 1000,
        currentScrollHeight: 1600,
      });
      expect(action).toEqual({ type: 'preserve-scroll', diff: 600 });
    });

    it('returns none when prepended but diff is zero or negative', () => {
      const action = computeChatScrollAction({
        isInitialLoad: false,
        isPrepended: true,
        isAppended: false,
        isNearBottom: false,
        prevScrollHeight: 1000,
        currentScrollHeight: 1000,
      });
      expect(action).toEqual({ type: 'none' });
    });

    it('returns none when no prepend or append occurred', () => {
      const action = computeChatScrollAction({
        isInitialLoad: false,
        isPrepended: false,
        isAppended: false,
        isNearBottom: true,
        prevScrollHeight: 1000,
        currentScrollHeight: 1000,
      });
      expect(action).toEqual({ type: 'none' });
    });
  });

  describe('isScrolledNearBottom', () => {
    it('returns true when scrollTop is near bottom', () => {
      const el = { scrollHeight: 1000, scrollTop: 580, clientHeight: 400 };
      // 1000 - 580 - 400 = 20 < 60
      expect(isScrolledNearBottom(el, 60)).toBe(true);
    });

    it('returns false when scrollTop is far from bottom', () => {
      const el = { scrollHeight: 1000, scrollTop: 200, clientHeight: 400 };
      // 1000 - 200 - 400 = 400 >= 60
      expect(isScrolledNearBottom(el, 60)).toBe(false);
    });
  });
});
