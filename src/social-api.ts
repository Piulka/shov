import { useCallback, useEffect, useRef, useState } from "react";
import type { SocialCommand, SocialView } from "../shared/social";
import type { RaidLoadout, RaidResult, RaidRole } from "../shared/raid";
import { ApiError, request } from "./api";

interface Envelope {
  id: string;
  command: SocialCommand;
}
const pendingKey = (id: string) => `shov-social-command:${id}`;

export function useSocial(query: string) {
  const [view, setView] = useState<SocialView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unresolved, setUnresolved] = useState(false);
  const [lastCommand, setLastCommand] = useState<SocialCommand | null>(null);
  const active = useRef(false);
  const reading = useRef<Promise<void> | null>(null);
  const working = useRef(false);
  const current = useRef<SocialView | null>(null);
  const pending = useRef<Envelope | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  const update = useCallback((next: SocialView) => {
    if (!active.current) return;
    if (!current.current) {
      try {
        const saved = sessionStorage.getItem(pendingKey(next.profile.id));
        if (saved) pending.current = JSON.parse(saved) as Envelope;
      } catch {
        /* A blocked browser store still permits this session to play. */
      }
      setUnresolved(!!pending.current);
    }
    current.current = next;
    setView(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!active.current || working.current || reading.current || document.hidden) return;
    const requestedQuery = queryRef.current;
    const run = async () => {
      try {
        const next = await request<SocialView>(
          `social?q=${encodeURIComponent(requestedQuery)}`,
        );
        if (queryRef.current === requestedQuery) {
          update(next);
          if (active.current && !pending.current) setError("");
        }
      } catch (caught) {
        if (active.current)
          setError(
            caught instanceof Error
              ? caught.message
              : "Не удалось обновить клан",
          );
      } finally {
        reading.current = null;
      }
    };
    reading.current = run();
    await reading.current;
  }, [update]);

  useEffect(() => {
    active.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      await reading.current;
      await refresh();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, refresh]);

  const remember = useCallback((envelope: Envelope | null) => {
    pending.current = envelope;
    if (active.current) setUnresolved(!!envelope);
    const profileId = current.current?.profile.id;
    if (!profileId) return;
    try {
      if (envelope)
        sessionStorage.setItem(pendingKey(profileId), JSON.stringify(envelope));
      else sessionStorage.removeItem(pendingKey(profileId));
    } catch {
      /* The in-memory envelope preserves retries without browser storage. */
    }
  }, []);

  const execute = useCallback(
    async (envelope: Envelope) => {
      if (working.current || !current.current) return false;
      working.current = true;
      setBusy(true);
      setError("");
      await reading.current;
      remember(envelope);
      try {
        let next: SocialView;
        try {
          next = await request<SocialView>("social/command", envelope);
        } catch (caught) {
          if (caught instanceof ApiError && caught.status < 500) throw caught;
          // A lost response may already have committed. Retry the same command ID.
          next = await request<SocialView>("social/command", envelope);
        }
        remember(null);
        update(next);
        if (active.current) setLastCommand(envelope.command);
        return true;
      } catch (caught) {
        const definite = caught instanceof ApiError && caught.status < 500;
        if (definite) remember(null);
        if (active.current)
          setError(
            definite && caught instanceof Error
              ? caught.message
              : "Ответ сервера не получен. Проверьте действие перед следующим ходом.",
          );
        return false;
      } finally {
        working.current = false;
        if (active.current) setBusy(false);
      }
    },
    [remember, update],
  );

  const command = useCallback(
    (command: SocialCommand) => {
      if (pending.current) return Promise.resolve(false);
      return execute({ id: crypto.randomUUID(), command });
    },
    [execute],
  );

  const retry = useCallback(async () => {
    if (pending.current) return execute(pending.current);
    setError("");
    await refresh();
    return true;
  }, [execute, refresh]);

  const practice = useCallback(async (role: RaidRole, loadout: RaidLoadout) => {
    if (working.current || pending.current) return null;
    working.current = true;
    setBusy(true);
    setError("");
    await reading.current;
    try {
      return await request<RaidResult>("social/practice", { role, loadout });
    } catch (caught) {
      if (active.current)
        setError(
          caught instanceof Error ? caught.message : "Пробный поход недоступен",
        );
      return null;
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
    }
  }, []);

  return {
    view,
    busy,
    error,
    unresolved,
    lastCommand,
    command,
    practice,
    retry,
  };
}
