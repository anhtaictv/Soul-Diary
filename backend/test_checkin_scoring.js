// Self-check cho tính điểm check-in (PHQ-9/GAD-7/PSS-10/WHO-5) — chạy: node test_checkin_scoring.js
// Không cần DB/server. PSS-10 có 4 câu đảo điểm (reverse scoring) — sai 1 index là sai điểm
// hiển thị cho người dùng về mức căng thẳng, dạng bug im lặng khó phát hiện bằng mắt.
const assert = require('assert');
const checkin = require('./routes/checkin');
const { validateAnswers, computeScores, TOTAL_QUESTIONS } = checkin;

assert.strictEqual(TOTAL_QUESTIONS, 31);

// ── validateAnswers ─────────────────────────────────────────────────────
assert.strictEqual(validateAnswers(new Array(30).fill(0)), false); // sai độ dài
assert.strictEqual(validateAnswers(new Array(31).fill(0)), true);
{
  const bad = new Array(31).fill(0);
  bad[16] = 5; // PSS-10 maxPerItem=4 → 5 vượt ngưỡng
  assert.strictEqual(validateAnswers(bad), false);
}

// ── computeScores: mảng toàn 0 — chỉ 4 câu đảo điểm của PSS-10 đóng góp ──
{
  const scores = computeScores(new Array(31).fill(0));
  assert.strictEqual(scores.phq9_score, 0);
  assert.strictEqual(scores.gad7_score, 0);
  assert.strictEqual(scores.who5_score, 0);
  // reverse: [3,4,6,7] (0-based trong block 10 câu) → mỗi câu góp (4-0)=4
  assert.strictEqual(scores.pss10_score, 16);
}

// ── computeScores: PSS-10 với giá trị khác nhau, tính tay để đối chiếu ───
{
  const answers = new Array(31).fill(0);
  const pss10Values = [0, 1, 2, 3, 4, 0, 1, 2, 3, 4]; // 10 câu, index 16-25
  pss10Values.forEach((v, i) => { answers[16 + i] = v; });
  // non-reverse (i=0,1,2,5,8,9): 0+1+2+0+3+4 = 10
  // reverse (i=3,4,6,7): (4-3)+(4-4)+(4-1)+(4-2) = 1+0+3+2 = 6
  const scores = computeScores(answers);
  assert.strictEqual(scores.pss10_score, 16);
}

// ── computeScores: WHO-5 không đảo điểm, nhân 4 để quy về thang 0-100 ────
{
  const answers = new Array(31).fill(0);
  [1, 2, 3, 4, 5].forEach((v, i) => { answers[26 + i] = v; }); // index 26-30
  const scores = computeScores(answers);
  assert.strictEqual(scores.who5_score, (1 + 2 + 3 + 4 + 5) * 4); // = 60
}

console.log('✅ Tất cả test tính điểm check-in (PHQ-9/GAD-7/PSS-10/WHO-5) đều pass.');
