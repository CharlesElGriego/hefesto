import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { ChatMessage, ChatRequest, ChatResponse } from '@hefesto/shared';

/** Typed HTTP client for the web chat endpoint. */
@Injectable({ providedIn: 'root' })
export class ChatApi {
  private readonly http = inject(HttpClient);

  send(message: string) {
    const body: ChatRequest = { message };
    return this.http.post<ChatResponse>('/api/chat', body);
  }

  history() {
    return this.http.get<ChatMessage[]>('/api/chat/history');
  }
}
