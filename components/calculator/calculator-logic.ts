// 일반 계산기 순수 로직 — UI와 분리(테스트 용이). 프로토타입 상태기계 이식.
// 천단위 콤마·12자리 제한·0 나누기 에러·히스토리(최대 8).
export type Op = 'add' | 'sub' | 'mul' | 'div';

export interface Hist {
  expr: string;
  result: string;
}
export interface State {
  current: string;
  stored: number | null;
  op: Op | null;
  overwrite: boolean;
  expr: string;
  error: boolean;
  history: Hist[];
}
export type Action =
  | { type: 'digit'; d: string }
  | { type: 'dot' }
  | { type: 'op'; op: Op }
  | { type: 'eq' }
  | { type: 'clear' }
  | { type: 'sign' }
  | { type: 'pct' }
  | { type: 'back' }
  | { type: 'clearHistory' }
  | { type: 'pickHistory'; result: string };

export const MAX_HISTORY = 8;
export const SYM: Record<Op, string> = { add: '+', sub: '−', mul: '×', div: '÷' };
export const INITIAL: State = {
  current: '0',
  stored: null,
  op: null,
  overwrite: true,
  expr: '',
  error: false,
  history: [],
};

export function trim(n: number): string {
  if (!isFinite(n)) return 'Error';
  return String(parseFloat(n.toPrecision(12)));
}

export function group(s: string): string {
  if (s === 'Error') return s;
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const parts = s.split('.');
  const intp = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + (parts.length > 1 ? `${intp}.${parts[1]}` : intp);
}

export function compute(a: number, b: number, op: Op): number | null {
  let r: number;
  if (op === 'add') r = a + b;
  else if (op === 'sub') r = a - b;
  else if (op === 'mul') r = a * b;
  else r = b === 0 ? NaN : a / b;
  return isFinite(r) ? r : null;
}

function cleared(s: State): State {
  return { ...s, current: '0', stored: null, op: null, overwrite: true, expr: '', error: false };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'digit': {
      const s = state.error ? cleared(state) : state;
      if (s.overwrite) return { ...s, current: action.d, overwrite: false, expr: s.op ? s.expr : '' };
      if (s.current.replace(/[-.]/g, '').length >= 12) return s;
      return { ...s, current: s.current === '0' ? action.d : s.current + action.d };
    }
    case 'dot': {
      const s = state.error ? cleared(state) : state;
      if (s.overwrite) return { ...s, current: '0.', overwrite: false, expr: s.op ? s.expr : '' };
      return s.current.includes('.') ? s : { ...s, current: `${s.current}.` };
    }
    case 'op': {
      if (state.error) return state;
      const cur = parseFloat(state.current);
      if (state.op != null && !state.overwrite) {
        const res = compute(state.stored!, cur, state.op);
        if (res === null) return { ...state, current: 'Error', error: true, op: null, stored: null, expr: '' };
        return {
          ...state,
          stored: res,
          current: trim(res),
          op: action.op,
          overwrite: true,
          expr: `${group(trim(res))} ${SYM[action.op]}`,
        };
      }
      return { ...state, stored: cur, op: action.op, overwrite: true, expr: `${group(state.current)} ${SYM[action.op]}` };
    }
    case 'eq': {
      if (state.error || state.op == null) return state;
      const a = state.stored!;
      const b = parseFloat(state.current);
      const res = compute(a, b, state.op);
      const exprStr = `${group(trim(a))} ${SYM[state.op]} ${group(state.current)}`;
      if (res === null) return { ...state, current: 'Error', error: true, op: null, stored: null, expr: '' };
      const resStr = trim(res);
      const history = [{ expr: exprStr, result: group(resStr) }, ...state.history].slice(0, MAX_HISTORY);
      return { ...state, current: resStr, op: null, stored: null, overwrite: true, expr: `${exprStr} =`, history };
    }
    case 'clear':
      return cleared(state);
    case 'sign': {
      if (state.error || state.current === '0') return state;
      return { ...state, current: state.current.startsWith('-') ? state.current.slice(1) : `-${state.current}` };
    }
    case 'pct':
      return state.error ? state : { ...state, current: trim(parseFloat(state.current) / 100), overwrite: true };
    case 'back': {
      if (state.error) return cleared(state);
      if (state.overwrite) return state;
      const str = state.current;
      if (str.length <= 1 || (str.length === 2 && str[0] === '-')) return { ...state, current: '0', overwrite: true };
      return { ...state, current: str.slice(0, -1) };
    }
    case 'clearHistory':
      return { ...state, history: [] };
    case 'pickHistory':
      return { ...cleared(state), current: action.result.replace(/,/g, '') };
    default:
      return state;
  }
}

export function toAction(a: string): Action {
  if (/^[0-9]$/.test(a)) return { type: 'digit', d: a };
  if (a === 'dot') return { type: 'dot' };
  if (a === 'add' || a === 'sub' || a === 'mul' || a === 'div') return { type: 'op', op: a };
  if (a === 'eq') return { type: 'eq' };
  if (a === 'sign') return { type: 'sign' };
  if (a === 'pct') return { type: 'pct' };
  return { type: 'clear' };
}
