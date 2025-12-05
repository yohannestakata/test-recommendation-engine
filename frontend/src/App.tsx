import { useEffect, useMemo, useState } from "react";

type BehaviorPreferences = {
  notes?: string;
  recentPattern?: string;
  vendorTraitWeights?: Record<string, number>;
};

type User = {
  id: number;
  name: string;
  adventurous: number;
  decisive: number;
  eccentric: number;
  flexible: number;
  loyal: number;
  optimistic: number;
  patient: number;
  perfectionist: number;
  punctual: number;
  behaviorPreferences?: BehaviorPreferences | null;
  isTestUser: boolean;
};

type Vendor = {
  id: number;
  name: string;
  description: string | null;
};

type RecommendationScores = {
  embeddingScore: number;
  traitScore: number;
  behaviorScore: number;
  finalScore: number;
};

type RecommendationItem = {
  vendor: Vendor;
  scores: RecommendationScores;
};

type RecommendationsResponse = {
  user: {
    id: number;
    name: string;
    traits: Record<string, number>;
    behaviorPreferences?: BehaviorPreferences | null;
    weights: {
      embedding: number;
      traits: number;
      behavior: number;
    };
    testMode: boolean;
  };
  recommendations: RecommendationItem[];
};

const API_BASE = "http://localhost:3000";

function formatNumber(n: number) {
  return n.toFixed(3);
}

function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [recommendations, setRecommendations] =
    useState<RecommendationsResponse | null>(null);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [testMode, setTestMode] = useState(false);
  const [adjustAdventurous, setAdjustAdventurous] = useState<number | null>(
    null
  );
  const [adjustPerfectionist, setAdjustPerfectionist] = useState<number | null>(
    null
  );

  const [likingVendorId, setLikingVendorId] = useState<number | null>(null);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? null,
    [users, selectedUserId]
  );

  useEffect(() => {
    async function fetchUsers() {
      try {
        setLoadingUsers(true);
        const res = await fetch(`${API_BASE}/users`);
        if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
        const data = (await res.json()) as User[];
        setUsers(data);
        if (data.length > 0) {
          // Prefer the test user if present
          const testUser = data.find((u) => u.isTestUser);
          setSelectedUserId((testUser ?? data[0]).id);
        }
      } catch (e) {
        console.error(e);
        setError((e as Error).message);
      } finally {
        setLoadingUsers(false);
      }
    }

    fetchUsers();
  }, []);

  async function loadRecommendations() {
    if (!selectedUserId) return;
    try {
      setError(null);
      setLoadingRecs(true);

      let url = `${API_BASE}/recommendations/${selectedUserId}`;
      const adjustments: Record<string, unknown> = {};

      if (testMode) {
        if (adjustAdventurous != null) {
          adjustments.Adventurous = adjustAdventurous;
        }
        if (adjustPerfectionist != null) {
          adjustments.Perfectionist = adjustPerfectionist;
        }
      }

      const hasAdjustments = Object.keys(adjustments).length > 0;
      const params = new URLSearchParams();
      if (testMode) params.set("testMode", "true");
      if (hasAdjustments)
        params.set("adjustments", JSON.stringify(adjustments));
      const qs = params.toString();
      if (qs) url += `?${qs}`;

      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.message ?? `Failed to fetch recommendations (${res.status})`
        );
      }
      const data = (await res.json()) as RecommendationsResponse;
      setRecommendations(data);
    } catch (e) {
      console.error(e);
      setError((e as Error).message);
    } finally {
      setLoadingRecs(false);
    }
  }

  async function likeVendor(vendorId: number) {
    if (!selectedUserId) return;
    try {
      setLikingVendorId(vendorId);
      setError(null);
      const res = await fetch(`${API_BASE}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          vendorId,
          liked: true,
          score: 5,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.message ?? `Failed to like vendor (${res.status})`
        );
      }
      await loadRecommendations();
    } catch (e) {
      console.error(e);
      setError((e as Error).message);
    } finally {
      setLikingVendorId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6">
        <header className="mb-6 border-b border-slate-800 pb-4">
          <h1 className="text-2xl font-semibold text-white">
            Recommendation Playground
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Pick a user, tweak traits in test mode, and see how vendors re-rank.
            This talks to the Nest backend at{" "}
            <code className="rounded bg-slate-900 px-1 py-0.5">
              http://localhost:3000
            </code>
            .
          </p>
        </header>

        <main className="flex flex-1 flex-col gap-6 lg:flex-row">
          {/* Left: controls */}
          <section className="w-full space-y-4 rounded-xl bg-slate-900/70 p-4 shadow-sm ring-1 ring-slate-800 lg:w-80">
            <h2 className="text-sm font-medium text-slate-200">Controls</h2>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">User</label>
              <select
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                disabled={loadingUsers}
                value={selectedUserId ?? ""}
                onChange={(e) =>
                  setSelectedUserId(Number(e.target.value) || null)
                }
              >
                <option value="">Select a user…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.isTestUser ? "(test user)" : ""}
                  </option>
                ))}
              </select>
              {loadingUsers && (
                <p className="text-xs text-slate-400">Loading users…</p>
              )}
            </div>

            <div className="mt-4 space-y-2 rounded-md bg-slate-950/60 p-3 border border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-200">
                  Test mode
                </span>
                <button
                  type="button"
                  onClick={() => setTestMode((v) => !v)}
                  className={`inline-flex h-6 items-center rounded-full px-1 text-[10px] font-medium transition ${
                    testMode
                      ? "bg-sky-500/80 text-slate-900"
                      : "bg-slate-800 text-slate-300"
                  }`}
                >
                  {testMode ? "On" : "Off"}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                When on, trait adjustments are applied only to this request and
                a fresh embedding is generated.
              </p>

              <div
                className={`mt-2 space-y-3 ${testMode ? "opacity-100" : "opacity-60"}`}
              >
                <div>
                  <label className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>Adventurous override</span>
                    <span className="tabular-nums text-slate-400">
                      {adjustAdventurous ?? "–"}/5
                    </span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    step={1}
                    disabled={!testMode}
                    value={adjustAdventurous ?? selectedUser?.adventurous ?? 3}
                    onChange={(e) =>
                      setAdjustAdventurous(Number(e.target.value))
                    }
                    className="mt-1 w-full accent-sky-500"
                  />
                </div>

                <div>
                  <label className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>Perfectionist override</span>
                    <span className="tabular-nums text-slate-400">
                      {adjustPerfectionist ?? "–"}/5
                    </span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    step={1}
                    disabled={!testMode}
                    value={
                      adjustPerfectionist ?? selectedUser?.perfectionist ?? 3
                    }
                    onChange={(e) =>
                      setAdjustPerfectionist(Number(e.target.value))
                    }
                    className="mt-1 w-full accent-sky-500"
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={loadRecommendations}
              disabled={!selectedUserId || loadingRecs}
              className="mt-2 inline-flex w-full items-center justify-center rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-slate-950 shadow-sm transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
            >
              {loadingRecs ? "Loading…" : "Load recommendations"}
            </button>

            {error && (
              <p className="mt-2 rounded bg-rose-950/60 px-2 py-1 text-[11px] text-rose-200 ring-1 ring-rose-800">
                {error}
              </p>
            )}

            {selectedUser && (
              <div className="mt-4 space-y-1 rounded-md bg-slate-950/60 p-3 text-[11px] text-slate-300 border border-slate-800">
                <div className="flex justify-between">
                  <span className="font-medium text-slate-200">
                    Selected user
                  </span>
                  {selectedUser.isTestUser && (
                    <span className="rounded bg-fuchsia-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-200">
                      Test
                    </span>
                  )}
                </div>
                <p>{selectedUser.name}</p>
                {selectedUser.behaviorPreferences?.notes && (
                  <p className="mt-1 text-slate-400">
                    <span className="font-semibold text-slate-300">Notes:</span>{" "}
                    {selectedUser.behaviorPreferences.notes}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Right: results */}
          <section className="flex-1 space-y-4 rounded-xl bg-slate-900/70 p-4 shadow-sm ring-1 ring-slate-800">
            <h2 className="text-sm font-medium text-slate-200">
              Recommendations
            </h2>

            {!recommendations && (
              <p className="text-sm text-slate-400">
                Pick a user and click{" "}
                <span className="font-semibold text-slate-200">
                  Load recommendations
                </span>{" "}
                to see ranked vendors.
              </p>
            )}

            {recommendations && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-950/60 p-3 text-xs text-slate-300 border border-slate-800">
                  <div>
                    <div className="font-semibold text-slate-100">
                      {recommendations.user.name} (user{" "}
                      {recommendations.user.id})
                    </div>
                    <div className="mt-0.5 text-slate-400">
                      testMode:{" "}
                      <span className="font-mono text-slate-200">
                        {recommendations.user.testMode ? "true" : "false"}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 text-right">
                    <div className="text-slate-400">weights</div>
                    <div className="font-mono text-[11px] text-slate-200">
                      emb:{" "}
                      {formatNumber(recommendations.user.weights.embedding)} ·
                      traits:{" "}
                      {formatNumber(recommendations.user.weights.traits)} ·
                      behavior:{" "}
                      {formatNumber(recommendations.user.weights.behavior)}
                    </div>
                  </div>
                </div>

                <div className="overflow-auto rounded-md border border-slate-800 bg-slate-950/40">
                  <table className="min-w-full text-left text-xs text-slate-200">
                    <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Vendor</th>
                        <th className="px-3 py-2">Scores</th>
                        <th className="px-3 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recommendations.recommendations.map((item, idx) => (
                        <tr
                          key={item.vendor.id}
                          className={
                            idx % 2 === 0
                              ? "bg-slate-900/40"
                              : "bg-slate-900/20"
                          }
                        >
                          <td className="px-3 py-2 align-top text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="font-medium text-slate-100">
                              {item.vendor.name}
                            </div>
                            {item.vendor.description && (
                              <div className="mt-0.5 text-[11px] text-slate-400">
                                {item.vendor.description}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="font-mono text-[11px] text-slate-200">
                              final: {formatNumber(item.scores.finalScore)}
                            </div>
                            <div className="mt-0.5 space-x-2 font-mono text-[11px] text-slate-400">
                              <span>
                                emb: {formatNumber(item.scores.embeddingScore)}
                              </span>
                              <span>
                                traits: {formatNumber(item.scores.traitScore)}
                              </span>
                              <span>
                                beh: {formatNumber(item.scores.behaviorScore)}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <button
                              type="button"
                              onClick={() => likeVendor(item.vendor.id)}
                              disabled={likingVendorId === item.vendor.id}
                              className="inline-flex items-center rounded-md bg-emerald-500/90 px-2 py-1 text-[11px] font-medium text-slate-950 shadow-sm transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
                            >
                              {likingVendorId === item.vendor.id
                                ? "Saving…"
                                : "Like 👍 & refresh"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
