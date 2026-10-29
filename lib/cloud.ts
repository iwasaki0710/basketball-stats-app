"use client";
import { useEffect, useRef, useState } from "react";
import { Workspace, workspaceSchema, clockAt } from "./model";
import { fingerprint, mergeWorkspaces, MergeConflict } from "./merge";
import { readDocument, writeDocument } from "./database";
import { supabase } from "./storage";
export type CloudLink = {
  teamId: string;
  userId: string;
  revision: number;
  hash: string;
  role: string;
};
const key = "courtvision.cloud.v1";
export function useCloud(
  data: Workspace,
  ready: boolean,
  onRemote: (w: Workspace) => void,
  enabled = true,
) {
  const [link, setLink] = useState<CloudLink | null>(null),
    [status, setStatus] = useState("未接続"),
    [conflict, setConflict] = useState(false),
    [retry, setRetry] = useState(0);
  const current = useRef(data),
    busy = useRef(false),
    generation = useRef(0),
    loaded = useRef(false),
    merges = useRef(0),
    linkRef = useRef(link);
  current.current = data;
  linkRef.current = link;
  const hash = fingerprint(data);
  const persist = (next: CloudLink | null) => {
    void writeDocument(key, next ?? undefined).catch(() =>
      setStatus(
        "同期状態を端末に保存できません。記録のバックアップを保管してください",
      ),
    );
    linkRef.current = next;
    setLink(next);
  };
  useEffect(() => {
    if (!enabled || !ready || loaded.current || !supabase) return;
    loaded.current = true;
    const epoch = generation.current;
    supabase.auth.getSession().then(async ({ data: session }) => {
      try {
        let cached = await readDocument<CloudLink>(key);
        if (!cached) {
          const legacy = localStorage.getItem(key);
          if (legacy) {
            cached = JSON.parse(legacy);
            await writeDocument(key, cached);
            localStorage.removeItem(key);
          }
        }
        if (!cached || !session.session) return;
        let saved: CloudLink = cached;
        if (
          saved.userId !== session.session.user.id ||
          epoch !== generation.current
        )
          return;
        if (saved.hash)
          saved = {
            ...saved,
            hash: fingerprint(workspaceSchema.parse(JSON.parse(saved.hash))),
          };
        persist(saved);
        if (!navigator.onLine) {
          setStatus("オフライン・端末に保存済み");
          return;
        }
        const { data: member, error: memberError } = await supabase!
          .from("memberships")
          .select("role")
          .eq("team_id", saved.teamId)
          .eq("user_id", saved.userId)
          .single();
        if (epoch !== generation.current) return;
        if (memberError || !member) {
          persist(null);
          setStatus("チームへのアクセスを確認できません");
          return;
        }
        saved = { ...saved, role: member.role };
        const { data: row, error } = await supabase!
          .from("workspaces")
          .select("data,revision")
          .eq("team_id", saved.teamId)
          .single();
        if (error) throw error;
        if (epoch !== generation.current) return;
        if (
          fingerprint(current.current) === saved.hash &&
          row.revision !== saved.revision
        ) {
          const w = workspaceSchema.parse(row.data);
          onRemote({ ...w, games: w.games.map((g) => clockAt(g)) });
          persist({ ...saved, revision: row.revision, hash: fingerprint(w) });
        } else persist(saved);
        setStatus("クラウド接続済み");
      } catch {
        setStatus("再接続できませんでした。端末の記録は保持しています");
      }
    });
  }, [ready, onRemote, enabled]);
  useEffect(() => {
    if (!enabled) return;
    const online = () => setRetry((v) => v + 1);
    window.addEventListener("online", online);
    const sub = supabase?.auth.onAuthStateChange((event, session) => {
      const linked = linkRef.current;
      if (
        linked &&
        (event === "SIGNED_OUT" || session?.user.id !== linked.userId)
      ) {
        generation.current++;
        persist(null);
        setConflict(false);
        setStatus("未接続");
      }
    });
    return () => {
      window.removeEventListener("online", online);
      sub?.data.subscription.unsubscribe();
    };
  }, [enabled]);
  useEffect(() => {
    if (
      !enabled ||
      !ready ||
      !link ||
      !supabase ||
      conflict ||
      link.role === "viewer" ||
      hash === link.hash
    )
      return;
    const epoch = generation.current;
    const timer = setTimeout(async () => {
      if (busy.current) return;
      if (!navigator.onLine) {
        setStatus("オフライン・端末に保存済み");
        return;
      }
      busy.current = true;
      setStatus("同期中");
      try {
        const snapshot = workspaceSchema.parse(current.current),
          sent = fingerprint(snapshot);
        const { data: revision, error } = await supabase!.rpc(
          "save_workspace",
          {
            p_team: link.teamId,
            p_expected_revision: link.revision,
            p_data: snapshot,
          },
        );
        if (epoch !== generation.current) return;
        if (error) {
          if (!error.message.includes("revision_conflict")) throw error;
          if (++merges.current > 3)
            throw new MergeConflict(
              "更新が続いています。少し待ってから再試行してください",
            );
          const { data: row, error: readError } = await supabase!
            .from("workspaces")
            .select("data,revision")
            .eq("team_id", link.teamId)
            .single();
          if (readError) throw readError;
          if (epoch !== generation.current) return;
          const remote = workspaceSchema.parse(row.data);
          if (!link.hash)
            throw new MergeConflict(
              "初回データの保存が競合しました。クラウドを読み込んでください",
            );
          const merged = mergeWorkspaces(
            workspaceSchema.parse(JSON.parse(link.hash)),
            current.current,
            remote,
          );
          onRemote({ ...merged, games: merged.games.map((g) => clockAt(g)) });
          persist({
            ...link,
            revision: row.revision,
            hash: fingerprint(remote),
          });
          setStatus("別端末の記録を安全に統合しました");
          return;
        }
        merges.current = 0;
        persist({ ...link, revision: Number(revision), hash: sent });
        setStatus("クラウド同期済み");
      } catch (e) {
        if (e instanceof MergeConflict) {
          setConflict(true);
          setStatus(`競合：${e.message}。端末データは保持しています`);
        } else
          setStatus("同期失敗・端末に保存済み。再接続または再試行できます");
      } finally {
        busy.current = false;
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [hash, link, ready, conflict, retry, onRemote, enabled]);
  useEffect(() => {
    if (!enabled || !link || !supabase || conflict) return;
    const epoch = generation.current;
    const timer = setInterval(async () => {
      if (
        busy.current ||
        !navigator.onLine ||
        fingerprint(current.current) !== link.hash
      )
        return;
      try {
        const { data: row, error } = await supabase!
          .from("workspaces")
          .select("data,revision")
          .eq("team_id", link.teamId)
          .single();
        if (
          error ||
          !row ||
          row.revision === link.revision ||
          epoch !== generation.current ||
          fingerprint(current.current) !== link.hash
        )
          return;
        const w = workspaceSchema.parse(row.data);
        onRemote({ ...w, games: w.games.map((g) => clockAt(g)) });
        persist({ ...link, revision: row.revision, hash: fingerprint(w) });
        setStatus("クラウド同期済み");
      } catch {
        setStatus("クラウド更新の読み込みに失敗。端末データは保持しています");
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [link, conflict, onRemote, enabled]);
  return {
    link,
    status,
    conflict,
    connect: (next: CloudLink) => {
      if (!enabled) return;
      generation.current++;
      merges.current = 0;
      setConflict(false);
      persist({
        ...next,
        hash: next.hash
          ? fingerprint(workspaceSchema.parse(JSON.parse(next.hash)))
          : "",
      });
      setStatus("クラウド接続済み");
    },
    disconnect: () => {
      if (!enabled) return;
      generation.current++;
      persist(null);
      setConflict(false);
      setStatus("未接続");
    },
    retry: () => {
      merges.current = 0;
      setConflict(false);
      setRetry((v) => v + 1);
    },
  };
}
export type CloudState = ReturnType<typeof useCloud>;
