import { describe, expect, it } from 'vitest';
import { parseProjectQr } from '../projectQr';
describe('project QR enrollment', () => {
  it('reads project code and PIN without following the URL', () => {
    expect(parseProjectQr('https://www.amehnities.org/join?code=k7m2qp&pin=1234')).toEqual({code:'K7M2QP',pin:'1234'});
  });
  it('accepts a printed raw project code', () => {
    expect(parseProjectQr(' k7m2qp ')).toEqual({code:'K7M2QP'});
  });
  it('rejects unrelated QR links', () => {
    expect(parseProjectQr('https://example.com/records?code=K7M2QP')).toBeNull();
    expect(parseProjectQr('javascript:alert(1)')).toBeNull();
  });
});