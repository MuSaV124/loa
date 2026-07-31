import assert from 'node:assert/strict';
import {
  extractAvatarEffects,
  extractAvatarStats,
  parseAvatarStatLine,
  stripTags
} from '../public/avatar-effects.js';

assert.equal(stripTags("<FONT SIZE='12'><FONT COLOR='#F99200'>전설 아바타</FONT></FONT>"), '전설 아바타');
assert.equal(stripTags('힘 +2.00%'), '힘 +2.00%');
assert.equal(stripTags(null), '');

assert.deepEqual(parseAvatarStatLine('힘 +2.00%'), { label: '힘', value: 2, unit: 'percent' });
assert.deepEqual(parseAvatarStatLine('무기 공격력 +150'), { label: '무기 공격력', value: 150, unit: 'flat' });
assert.deepEqual(parseAvatarStatLine('지능 +1.00%'), { label: '지능', value: 1, unit: 'percent' });
// 성향 수치와 기본 효과 제목은 스탯이 아니다.
assert.equal(parseAvatarStatLine('지성 : 5'), null);
assert.equal(parseAvatarStatLine('기본 효과'), null);
assert.equal(parseAvatarStatLine('브레이커 전용'), null);
assert.equal(parseAvatarStatLine('힘 +0%'), null);

// 무사브 응답의 실제 툴팁 구조.
const tooltipWithStat = JSON.stringify({
  AvatarAttribute: { IsInner: true, IsSet: false },
  Element_000: { type: 'NameTagBox', value: "<P ALIGN='CENTER'>유연한 영원 헤비 건틀릿 (귀속)</P>" },
  Element_002: { type: 'SingleTextBox', value: "<FONT SIZE='12'>브레이커 전용</FONT>" },
  Element_005: {
    type: 'ItemPartBox',
    value: {
      Element_000: "<FONT COLOR='#A9D0F5'>기본 효과</FONT>",
      Element_001: '힘 +2.00%'
    }
  },
  Element_006: null,
  Element_007: {
    type: 'SymbolString',
    value: {
      contentStr: '&tdc_smart 지성 : 5<BR>&tdc_courage 담력 : 5<BR>',
      titleStr: "<FONT COLOR='#A9D0F5'>성향</FONT>"
    }
  }
});

assert.deepEqual(extractAvatarStats(tooltipWithStat), [{ label: '힘', value: 2, unit: 'percent' }]);
assert.deepEqual(extractAvatarStats('깨진 JSON'), []);
assert.deepEqual(extractAvatarStats(null), []);

const tooltipNoStat = JSON.stringify({
  Element_000: { type: 'NameTagBox', value: '애플 풍선껌' },
  Element_003: { type: 'SingleTextBox', value: '판매불가' }
});
assert.deepEqual(extractAvatarStats(tooltipNoStat), []);

const avatarWith = (type, name, grade, isInner, percent) => ({
  Type: type,
  Name: name,
  Grade: grade,
  IsInner: isInner,
  IsSet: false,
  Tooltip: JSON.stringify({
    Element_005: {
      type: 'ItemPartBox',
      value: { Element_000: '기본 효과', Element_001: `힘 +${percent.toFixed(2)}%` }
    }
  })
});

// 무사브 실제 구성: 속옷 전설 4개(각 2%) + 일반 영웅 3개(각 1%) = 힘 +11%.
const effects = extractAvatarEffects([
  avatarWith('무기 아바타', '유연한 영원 헤비 건틀릿 (귀속)', '전설', true, 2),
  avatarWith('머리 아바타', '유연한 영원 머리 (귀속)', '전설', true, 2),
  avatarWith('상의 아바타', '유연한 영원 상의 (귀속)', '전설', true, 2),
  avatarWith('하의 아바타', '유연한 영원 하의 (귀속)', '전설', true, 2),
  { Type: '얼굴1 아바타', Name: '애플 풍선껌', Grade: '영웅', IsInner: false, IsSet: false, Tooltip: tooltipNoStat },
  avatarWith('무기 아바타', '6주년 잔상 헤비 건틀릿', '영웅', false, 1),
  avatarWith('상의 아바타', 'MUSINSA - 어반 스트릿 A 상의', '영웅', false, 1),
  avatarWith('하의 아바타', 'MUSINSA - 어반 스트릿 하의', '영웅', false, 1)
]);

assert.equal(effects.count, 8);
assert.equal(effects.withStatCount, 7);
assert.equal(effects.percentTotals['힘'], 11);
assert.deepEqual(effects.flatTotals, {});

// 같은 부위에 속옷과 일반 아바타가 함께 있어도 둘 다 합산한다.
const weaponSlots = effects.items.filter(item => item.type === '무기 아바타');
assert.equal(weaponSlots.length, 2);
assert.equal(weaponSlots.filter(item => item.isInner).length, 1);

// 고정 수치와 퍼센트는 따로 모은다.
const mixed = extractAvatarEffects([
  {
    Type: '무기 아바타',
    Name: '테스트',
    Grade: '전설',
    IsInner: false,
    IsSet: false,
    Tooltip: JSON.stringify({
      Element_005: {
        type: 'ItemPartBox',
        value: { Element_000: '기본 효과', Element_001: '무기 공격력 +120', Element_002: '지능 +2.00%' }
      }
    })
  }
]);
assert.equal(mixed.flatTotals['무기 공격력'], 120);
assert.equal(mixed.percentTotals['지능'], 2);

for (const empty of [null, undefined, []]) {
  const result = extractAvatarEffects(empty);
  assert.equal(result.count, 0);
  assert.deepEqual(result.percentTotals, {});
  assert.deepEqual(result.flatTotals, {});
}

console.log('avatar effect tests passed');
