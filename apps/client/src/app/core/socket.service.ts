import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SocketService {
  // No serverUrl configured means same-origin (production serves client + socket from one host).
  private socket: Socket = environment.serverUrl
    ? io(environment.serverUrl, { autoConnect: true })
    : io({ autoConnect: true });

  readonly connected = signal(this.socket.connected);

  constructor() {
    this.socket.on('connect', () => this.connected.set(true));
    this.socket.on('disconnect', () => this.connected.set(false));
  }

  emit<T = unknown>(event: string, payload: T): void {
    this.socket.emit(event, payload);
  }

  emitWithAck<T = unknown, R = unknown>(event: string, payload: T): Promise<R> {
    return this.socket.emitWithAck(event, payload) as Promise<R>;
  }

  on<T = unknown>(event: string): Observable<T> {
    return new Observable<T>((subscriber) => {
      const handler = (payload: T) => subscriber.next(payload);
      this.socket.on(event, handler);
      return () => this.socket.off(event, handler);
    });
  }
}
