// Signals use only closed bars. A position change executes at the next hourly open.
export function replay(candles, side, now = Date.now()) {
  const hour = 3600000, fee = 0.0005;
  const bars = candles.filter(b => b.t + hour <= now).slice(-44);
  if (bars.length !== 44 || bars.some((b,i) => !(b.o > 0 && b.c > 0) || (i && b.t-bars[i-1].t !== hour))) return null;
  let cash = 100, units = 0, trades = 0, peak = 100, drawdown = 0;
  const curve = [100];
  function close(price) {
    cash += units*price - Math.abs(units)*price*fee;
    units = 0;
  }
  for (let i = 20; i < bars.length; i++) {
    const bar = bars[i], prior = bars.slice(i-20,i);
    const mean = prior.reduce((sum,b)=>sum+b.c,0)/20;
    const hold = side*(prior.at(-1).c-mean) > 0;
    if (!hold && units) close(bar.o);
    if (hold && !units) {
      const capital = cash/(1+fee);
      units = side*capital/bar.o;
      cash -= units*bar.o + capital*fee;
      trades++;
    }
    if (i === bars.length-1 && units) close(bar.c);
    const nav = cash + units*bar.c;
    peak = Math.max(peak,nav);
    drawdown = Math.max(drawdown,1-nav/peak);
    curve.push(nav);
  }
  return {gain:cash-100, drawdown:drawdown*100, trades, curve, end:bars.at(-1).t+hour,
    underlying:(bars.at(-1).c/bars[20].o-1)*100};
}
