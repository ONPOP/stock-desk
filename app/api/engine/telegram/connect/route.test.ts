// 텔레그램 연결 GET의 "이미 연결됨" 가드 실증 테스트 (D18 리뷰 Important 2).
// getUpdates가 offset 없이 항상 같은 /start 메시지를 돌려주므로, chat_id가 이미 있으면
// findChatId·sendMessage·saveChatId를 다시 호출하지 않아야 재폴링·중복 탭에서 "연결 완료"
// 메시지가 중복 발송되지 않는다. 실제 라우트 핸들러(GET)를 직접 호출해 이를 검증한다.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  requireUser: () => mockRequireUser(),
}));

const mockLoadTelegramSettings = vi.fn();
const mockSaveChatId = vi.fn();
const mockRecordError = vi.fn();
vi.mock('@/lib/engine/telegram-settings', () => ({
  loadTelegramSettings: (...args: unknown[]) => mockLoadTelegramSettings(...args),
  saveChatId: (...args: unknown[]) => mockSaveChatId(...args),
  saveToken: vi.fn(),
  recordError: (...args: unknown[]) => mockRecordError(...args),
}));

const mockFindChatId = vi.fn();
const mockSendMessage = vi.fn();
const mockGetMe = vi.fn();
vi.mock('@/lib/engine/telegram', () => ({
  findChatId: (...args: unknown[]) => mockFindChatId(...args),
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  getMe: (...args: unknown[]) => mockGetMe(...args),
  // vi.mock 팩토리는 파일 최상단으로 호이스팅되므로 클래스는 팩토리 안에서 직접 선언해야 한다
  // (바깥의 const/class를 참조하면 TDZ로 "before initialization" 에러가 난다)
  TelegramError: class TelegramError extends Error {},
}));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue({ supabase: {}, user: { id: 'user-1' } });
  mockRecordError.mockResolvedValue(undefined);
});

describe('GET /api/engine/telegram/connect', () => {
  it('이미 chat_id가 있으면 텔레그램을 호출하지 않고 바로 반환한다', async () => {
    mockLoadTelegramSettings.mockResolvedValue({
      botToken: 'stored-token',
      botUsername: '@bot',
      chatId: 'already-connected-chat',
      enabledSlotIds: [],
      lastError: null,
    });

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ chatId: 'already-connected-chat', testMessageError: null });
    expect(mockFindChatId).not.toHaveBeenCalled();
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(mockSaveChatId).not.toHaveBeenCalled();
  });

  it('chat_id가 아직 없으면 findChatId를 호출해 정상 흐름을 탄다', async () => {
    mockLoadTelegramSettings.mockResolvedValue({
      botToken: 'stored-token',
      botUsername: '@bot',
      chatId: null,
      enabledSlotIds: [],
      lastError: null,
    });
    mockFindChatId.mockResolvedValue('new-chat-id');
    mockSaveChatId.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue(undefined);

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ chatId: 'new-chat-id', testMessageError: null });
    expect(mockFindChatId).toHaveBeenCalledWith('stored-token');
    expect(mockSaveChatId).toHaveBeenCalledWith({}, 'user-1', 'new-chat-id');
    expect(mockSendMessage).toHaveBeenCalledOnce();
  });
});
