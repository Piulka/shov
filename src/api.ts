import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GameCommand,
  GameView,
  JourneyReport,
  TrainingResult,
} from "../shared/types";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
        expand?: () => void;
        colorScheme?: string;
        BackButton?: {
          show(): void;
          hide(): void;
          onClick(callback: () => void): void;
          offClick(callback: () => void): void;
        };
      };
    };
  }
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, data?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`/api/${path}`, {
      method: data === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers:
        data === undefined ? undefined : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: controller.signal,
    });
    const body = await response.json();
    if (!response.ok)
      throw new ApiError(
        body.message || body.error || "Не удалось выполнить действие",
        response.status,
      );
    return body as T;
  } finally {
    window.clearTimeout(timeout);
  }
}
export function useGame() {
  const [view, setView] = useState<GameView | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState("");
  const [report, setReport] = useState<JourneyReport | null>(null);
  const [returnReport, setReturnReport] = useState(false);
  const lock = useRef(false);
  const mutating = useRef(false);
  const current = useRef<GameView | null>(null);
  const active = useRef(true);
  const acquire = useCallback(async () => {
    if (mutating.current) return false;
    mutating.current = true;
    setBusy(true);
    while (lock.current && active.current) {
      await new Promise((resolve) => window.setTimeout(resolve, 25));
    }
    if (!active.current) {
      mutating.current = false;
      setBusy(false);
      return false;
    }
    lock.current = true;
    return true;
  }, []);
  const update = useCallback((next: GameView) => {
    if (!active.current) return;
    current.current = next;
    setView(next);
    setOnline(true);
  }, []);
  const connect = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setError("");
    try {
      let next: GameView;
      try {
        next = await request<GameView>("state");
      } catch (caught) {
        if (!(caught instanceof ApiError) || caught.status !== 401)
          throw caught;
        next = await request<GameView>("auth", {
          initData: window.Telegram?.WebApp?.initData || undefined,
        });
      }
      update(next);
      if (next.report && next.report.seconds >= 60) {
        setReport(next.report);
        setReturnReport(true);
      }
      window.Telegram?.WebApp?.ready?.();
      window.Telegram?.WebApp?.expand?.();
    } catch (caught) {
      setOnline(false);
      setError(caught instanceof Error ? caught.message : "Сервер недоступен");
    } finally {
      lock.current = false;
    }
  }, [update]);
  useEffect(() => {
    active.current = true;
    void connect();
    const timer = window.setInterval(async () => {
      if (
        lock.current ||
        mutating.current ||
        !current.current ||
        document.hidden
      )
        return;
      lock.current = true;
      try {
        const next = await request<GameView>("state");
        update(next);
        if (next.report && next.report.seconds >= 60) {
          setReport(next.report);
          setReturnReport(true);
        }
      } catch {
        setOnline(false);
      } finally {
        lock.current = false;
      }
    }, 3000);
    return () => {
      active.current = false;
      window.clearInterval(timer);
    };
  }, [connect, update]);
  const command = useCallback(
    async (command: GameCommand) => {
      if (!current.current || !(await acquire())) return false;
      setError("");
      const id = crypto.randomUUID();
      try {
        let next: GameView;
        try {
          next = await request<GameView>("command", {
            id,
            revision: current.current.revision,
            command,
          });
        } catch (caught) {
          if (!(caught instanceof ApiError) || caught.status !== 409)
            throw caught;
          const fresh = await request<GameView>("state");
          update(fresh);
          next = await request<GameView>("command", {
            id,
            revision: fresh.revision,
            command,
          });
        }
        update(next);
        return true;
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Не удалось выполнить действие",
        );
        return false;
      } finally {
        lock.current = false;
        mutating.current = false;
        setBusy(false);
      }
    },
    [update, acquire],
  );
  const train = useCallback(
    async (routeId: string) => {
      if (!(await acquire())) return null;
      setError("");
      try {
        return await request<TrainingResult>("train", { routeId });
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Испытание недоступно",
        );
        return null;
      } finally {
        lock.current = false;
        mutating.current = false;
        setBusy(false);
      }
    },
    [acquire],
  );
  return {
    view,
    busy,
    online,
    error,
    setError,
    command,
    train,
    report,
    returnReport,
    closeReport: () => setReturnReport(false),
    connect,
  };
}
