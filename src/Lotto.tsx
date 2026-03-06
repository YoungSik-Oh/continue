import React, { useState, useCallback, useEffect, useRef } from 'react';
import './Lotto.css';

const MIN = 1;
const MAX = 45;
const COUNT = 6;
const LINES = 5;
const RECENT_DRAWS = 5;
const LOTTO_API = 'https://smok95.github.io/lotto/results';

interface LottoDraw {
  draw_no: number;
  numbers: number[];
  bonus_no: number;
  date: string;
  divisions?: { prize: number; winners: number }[];
}

function getRandomNumbers(): number[] {
  const set = new Set<number>();
  while (set.size < COUNT) {
    set.add(Math.floor(Math.random() * (MAX - MIN + 1)) + MIN);
  }
  return Array.from(set).sort((a, b) => a - b);
}

function ballClass(n: number): string {
  return `lotto-ball ball-${Math.min(Math.floor(n / 10), 4)}`;
}

/** 6개+보너스와 당첨번호 비교 → 1~5등 또는 0(꽝) */
function getRank(
  myNumbers: number[],
  myBonus: number,
  draw: LottoDraw
): { rank: number; matchCount: number; hasBonus: boolean } {
  const winSet = new Set(draw.numbers);
  const matchCount = myNumbers.filter((n) => winSet.has(n)).length;
  const hasBonus = myBonus === draw.bonus_no;
  if (matchCount === 6) return { rank: 1, matchCount, hasBonus };
  if (matchCount === 5 && hasBonus) return { rank: 2, matchCount, hasBonus };
  if (matchCount === 5) return { rank: 3, matchCount, hasBonus };
  if (matchCount === 4) return { rank: 4, matchCount, hasBonus };
  if (matchCount === 3) return { rank: 5, matchCount, hasBonus };
  return { rank: 0, matchCount, hasBonus };
}

function getNextDrawDate(): Date {
  const d = new Date();
  const day = d.getDay();
  let daysUntilSat = (6 - day + 7) % 7;
  if (daysUntilSat === 0 && d.getHours() >= 21) daysUntilSat = 7;
  d.setDate(d.getDate() + daysUntilSat);
  return d;
}

function formatPrize(amount: number): string {
  if (amount >= 100000000) return `${Math.floor(amount / 100000000)}억 원`;
  if (amount >= 10000) return `${Math.floor(amount / 10000)}만 원`;
  return `${amount.toLocaleString()}원`;
}

function Lotto(): React.ReactElement {
  const [lines, setLines] = useState<number[][]>([]);
  const [recentDraws, setRecentDraws] = useState<LottoDraw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const draw = useCallback(() => {
    const result: number[][] = [];
    for (let i = 0; i < LINES; i++) {
      result.push(getRandomNumbers());
    }
    setLines(result);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${LOTTO_API}/latest.json`)
      .then((res) => res.json())
      .then((latest: LottoDraw) => {
        if (cancelled) return;
        const maxNo = latest.draw_no;
        const promises: Promise<LottoDraw>[] = [];
        for (let i = 0; i < RECENT_DRAWS; i++) {
          promises.push(
            fetch(`${LOTTO_API}/${maxNo - i}.json`).then((r) => r.json())
          );
        }
        return Promise.all(promises);
      })
      .then((list) => {
        if (cancelled) return;
        setRecentDraws(list ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || '당첨 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const frequency = React.useMemo(() => {
    const count: Record<number, number> = {};
    for (let n = MIN; n <= MAX; n++) count[n] = 0;
    recentDraws.forEach((d) => {
      d.numbers.forEach((n) => count[n]++);
      count[d.bonus_no]++;
    });
    return Object.entries(count)
      .map(([num, cnt]) => ({ num: Number(num), cnt }))
      .filter((x) => x.cnt > 0)
      .sort((a, b) => b.cnt - a.cnt)
      .slice(0, 15);
  }, [recentDraws]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  type TabId = 'draw' | 'recent' | 'frequency' | 'check';
  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'draw', label: '번호 뽑기', icon: '🎱' },
    { id: 'check', label: '당첨 확인', icon: '✅' },
    { id: 'recent', label: '최근 당첨', icon: '📋' },
    { id: 'frequency', label: '번호 빈도', icon: '📊' },
  ];
  const [activeTab, setActiveTab] = useState<TabId>('draw');

  const [checkDrawIndex, setCheckDrawIndex] = useState(0);
  const [checkDrawOpen, setCheckDrawOpen] = useState(false);
  const checkDrawRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!checkDrawOpen) return;
    const close = (e: MouseEvent) => {
      if (checkDrawRef.current && !checkDrawRef.current.contains(e.target as Node)) {
        setCheckDrawOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [checkDrawOpen]);
  const [checkNumbers, setCheckNumbers] = useState<[number, number, number, number, number, number]>([0, 0, 0, 0, 0, 0]);
  const [checkBonus, setCheckBonus] = useState(0);
  const [checkResult, setCheckResult] = useState<{ rank: number; matchCount: number; hasBonus: boolean } | null>(null);

  const handleCheck = useCallback(() => {
    const draw = recentDraws[checkDrawIndex];
    if (!draw) return;
    const sorted = [...checkNumbers].sort((a, b) => a - b);
    const allInRange = sorted.every((n) => n >= MIN && n <= MAX);
    const sixDistinct = new Set(sorted).size === 6 && sorted.length === 6;
    const bonusValid = checkBonus >= MIN && checkBonus <= MAX && !sorted.includes(checkBonus);
    if (!allInRange || !sixDistinct || !bonusValid) {
      setCheckResult(null);
      return;
    }
    setCheckResult(getRank(sorted, checkBonus, draw));
  }, [recentDraws, checkDrawIndex, checkNumbers, checkBonus]);

  const nextDrawDate = getNextDrawDate();

  return (
    <div className="lotto-page">
      <h1 className="lotto-title">🎱 로또</h1>
      <p className="lotto-next-draw">다음 추첨: {nextDrawDate.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}</p>

      <nav className="lotto-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`lotto-tab ${activeTab === tab.id ? 'lotto-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="lotto-tab-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="lotto-tab-panels" data-active-tab={activeTab}>
        {activeTab === 'draw' && (
          <section className="lotto-tab-panel" aria-labelledby="tab-draw">
            <p className="lotto-desc">1~45 중 6개 번호가 5줄 랜덤으로 뽑힙니다.</p>
            <button type="button" className="lotto-btn" onClick={draw}>
              번호 뽑기
            </button>
            {lines.length > 0 && (
              <div className="lotto-lines">
                {lines.map((nums, lineIdx) => (
                  <div key={lineIdx} className="lotto-balls">
                    {nums.map((num, i) => (
                      <span key={i} className={ballClass(num)}>
                        {num}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'check' && (
          <section className="lotto-tab-panel lotto-check-panel" aria-labelledby="tab-check">
            <p className="lotto-recent-desc">회차를 선택하고 내 번호 6개 + 보너스를 입력한 뒤 확인하세요.</p>
            {recentDraws.length > 0 && (
              <>
                <div className="lotto-check-row">
                  <label className="lotto-check-label">회차</label>
                  <div className="lotto-check-select-wrap" ref={checkDrawRef}>
                    <button
                      type="button"
                      className="lotto-check-select"
                      onClick={() => setCheckDrawOpen((v) => !v)}
                      aria-expanded={checkDrawOpen}
                      aria-haspopup="listbox"
                      aria-label="당첨 확인할 회차 선택"
                    >
                      {recentDraws[checkDrawIndex]
                        ? `${recentDraws[checkDrawIndex].draw_no}회 (${formatDate(recentDraws[checkDrawIndex].date)})`
                        : '회차 선택'}
                      <span className="lotto-check-select-arrow" aria-hidden>▼</span>
                    </button>
                    {checkDrawOpen && (
                      <ul
                        className="lotto-check-select-list"
                        role="listbox"
                        aria-label="회차 목록"
                      >
                        {recentDraws.map((d, i) => (
                          <li
                            key={d.draw_no}
                            role="option"
                            aria-selected={checkDrawIndex === i}
                            className={`lotto-check-select-option ${checkDrawIndex === i ? 'lotto-check-select-option--selected' : ''}`}
                            onClick={() => {
                              setCheckDrawIndex(i);
                              setCheckDrawOpen(false);
                              setCheckResult(null);
                            }}
                          >
                            {d.draw_no}회 ({formatDate(d.date)})
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="lotto-check-row">
                  <label className="lotto-check-label">번호 6개</label>
                  <div className="lotto-check-inputs">
                    {([0, 1, 2, 3, 4, 5] as const).map((i) => (
                      <input
                        key={i}
                        type="number"
                        min={MIN}
                        max={MAX}
                        className="lotto-check-input"
                        value={checkNumbers[i] || ''}
                        onChange={(e) => {
                          const v = e.target.value ? Number(e.target.value) : 0;
                          const next = [...checkNumbers] as [number, number, number, number, number, number];
                          next[i] = v;
                          setCheckNumbers(next);
                          setCheckResult(null);
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="lotto-check-row">
                  <label className="lotto-check-label">보너스</label>
                  <input
                    type="number"
                    min={MIN}
                    max={MAX}
                    className="lotto-check-input lotto-check-bonus"
                    value={checkBonus || ''}
                    onChange={(e) => { setCheckBonus(e.target.value ? Number(e.target.value) : 0); setCheckResult(null); }}
                  />
                </div>
                <button type="button" className="lotto-btn" onClick={handleCheck}>
                  당첨 확인
                </button>
                {checkResult !== null && (
                  <div className={`lotto-check-result lotto-check-result--rank-${checkResult.rank}`}>
                    {checkResult.rank === 0 ? (
                      <>꽝 (일치: {checkResult.matchCount}개)</>
                    ) : (
                      <>{checkResult.rank}등 당첨! (일치: {checkResult.matchCount}개{checkResult.hasBonus && ' + 보너스'})</>
                    )}
                  </div>
                )}
              </>
            )}
            {loading && <p className="lotto-recent-loading">당첨 정보 불러오는 중...</p>}
            {error && <p className="lotto-recent-error">{error}</p>}
          </section>
        )}

        {activeTab === 'recent' && (
          <section className="lotto-tab-panel" aria-labelledby="tab-recent">
            <p className="lotto-recent-desc">
              최근 {RECENT_DRAWS}회차 당첨 번호 (동행복권 데이터 기반)
            </p>
            {loading && <p className="lotto-recent-loading">당첨 정보 불러오는 중...</p>}
            {error && <p className="lotto-recent-error">{error}</p>}
            {!loading && !error && recentDraws.length > 0 && (
              <div className="lotto-recent-list">
                {recentDraws.map((d) => (
                  <div key={d.draw_no} className="lotto-recent-item">
                    <div className="lotto-recent-meta">
                      <span className="lotto-recent-round">{d.draw_no}회</span>
                      <span className="lotto-recent-date">{formatDate(d.date)}</span>
                    </div>
                    <div className="lotto-balls">
                      {d.numbers.map((num, i) => (
                        <span key={i} className={ballClass(num)}>
                          {num}
                        </span>
                      ))}
                      <span className={`lotto-ball lotto-ball-bonus ${ballClass(d.bonus_no)}`}>
                        +{d.bonus_no}
                      </span>
                    </div>
                    {d.divisions && d.divisions.length > 0 && (
                      <div className="lotto-divisions">
                        {d.divisions.map((div, i) => (
                          <div key={i} className="lotto-division">
                            <span className="lotto-division-rank">{i + 1}등</span>
                            <span className="lotto-division-prize">{formatPrize(div.prize)}</span>
                            <span className="lotto-division-winners">{div.winners.toLocaleString()}명</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'frequency' && (
          <section className="lotto-tab-panel" aria-labelledby="tab-frequency">
            <p className="lotto-recent-desc">
              최근 {RECENT_DRAWS}회차 당첨·보너스 번호 출현 횟수 (많은 순)
            </p>
            {loading && <p className="lotto-recent-loading">당첨 정보 불러오는 중...</p>}
            {error && <p className="lotto-recent-error">{error}</p>}
            {!loading && !error && frequency.length > 0 && (
              <div className="lotto-freq-list">
                {frequency.map(({ num, cnt }) => (
                  <div key={num} className="lotto-freq-item">
                    <span className={ballClass(num)}>{num}</span>
                    <span className="lotto-freq-count">{cnt}회</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export default Lotto;
