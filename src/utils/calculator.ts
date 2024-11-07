import { CalculationError } from '@/types/calculator'

// Cache per risultati recenti
const resultCache = new Map<string, number>();

// Contesto matematico per le operazioni
const mathContext = {
  ...Math,
  // Funzioni trigonometriche (input in gradi)
  sin: (x: number) => {
    const normalized = ((x % 360) + 360) % 360;
    return Math.sin((normalized * Math.PI) / 180);
  },
  cos: (x: number) => {
    const normalized = ((x % 360) + 360) % 360;
    
    if (normalized === 0 || normalized === 360) return 1;
    if (normalized === 90 || normalized === 270) return 0;
    if (normalized === 180) return -1;
    if (normalized === 60 || normalized === 300) return 0.5;
    if (normalized === 120 || normalized === 240) return -0.5;
    
    return Math.cos((normalized * Math.PI) / 180);
  },
  tan: (x: number) => {
    const normalized = ((x % 360) + 360) % 360;
    
    if (Math.abs(normalized - 90) < 1e-10 || Math.abs(normalized - 270) < 1e-10) {
      throw new Error(CalculationError.UNDEFINED);
    }
    
    if (normalized === 0 || normalized === 180 || normalized === 360) return 0;
    if (normalized === 45 || normalized === 225) return 1;
    if (normalized === 135 || normalized === 315) return -1;
    if (normalized === 60) return Math.sqrt(3);
    if (normalized === 240) return Math.sqrt(3);
    if (normalized === 120 || normalized === 300) return -Math.sqrt(3);
    
    return Math.tan((normalized * Math.PI) / 180);
  },
  
  // Funzioni inverse (output in gradi)
  asin: (x: number) => {
    if (Math.abs(x) > 1) throw new Error(CalculationError.DOMAIN);
    return Math.asin(x) * 180 / Math.PI;
  },
  acos: (x: number) => {
    if (Math.abs(x) > 1) throw new Error(CalculationError.DOMAIN);
    return Math.acos(x) * 180 / Math.PI;
  },
  atan: (x: number) => Math.atan(x) * 180 / Math.PI,
  
  // Logaritmi con controlli
  log: (x: number) => {
    if (x <= 0) throw new Error(CalculationError.DOMAIN);
    return Math.log10(x);
  },
  ln: (x: number) => {
    if (x <= 0) throw new Error(CalculationError.DOMAIN);
    return Math.log(x);
  },
  
  // Potenze e radici con controlli
  sqrt: (x: number) => {
    if (x < 0) throw new Error(CalculationError.DOMAIN);
    return Math.sqrt(x);
  },
  pow: (base: number, exp: number) => {
    const result = Math.pow(base, exp);
    if (!isFinite(result)) throw new Error(CalculationError.OVERFLOW);
    return result;
  },
  
  // Costanti
  pi: Math.PI,
  e: Math.E,
};

export const safeEvaluate = (expression: string): number => {
  // Controllo cache con limite di dimensione
  if (resultCache.size > 100) {
    const firstKey = resultCache.keys().next().value;
    resultCache.delete(firstKey);
  }
  
  if (resultCache.has(expression)) {
    return resultCache.get(expression)!;
  }
  
  const sanitized = expression.replace(/\s+/g, '');
  
  // Validazione più robusta
  if (!/^[0-9+\-*/().Math\w,[\]]+$/.test(sanitized)) {
    throw new Error(CalculationError.INVALID);
  }
  
  // Verifica bilanciamento parentesi
  const openCount = (sanitized.match(/\(/g) || []).length;
  const closeCount = (sanitized.match(/\)/g) || []).length;
  
  if (openCount !== closeCount) {
    throw new Error(CalculationError.SYNTAX);
  }
  
  try {
    const result = new Function('Math', `return ${sanitized}`)(mathContext);
    
    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error(CalculationError.INVALID);
    }
    
    resultCache.set(expression, result);
    return result;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Domain')) {
        throw new Error(CalculationError.DOMAIN);
      }
      if (error.message.includes('Undefined')) {
        throw new Error(CalculationError.UNDEFINED);
      }
      if (error.message.includes('Overflow')) {
        throw new Error(CalculationError.OVERFLOW);
      }
      if (error.message.includes('Invalid')) {
        throw new Error(CalculationError.INVALID);
      }
      throw new Error(CalculationError.SYNTAX);
    }
    throw new Error(CalculationError.UNKNOWN);
  }
}

export const formatNumber = (num: number): string => {
  // Gestione numeri molto piccoli
  if (Math.abs(num) < 1e-10 && num !== 0) {
    return num.toExponential(4);
  }
  
  // Gestione numeri molto grandi
  if (Math.abs(num) > 1e9) {
    return num.toExponential(4);
  }
  
  // Numeri normali con precisione controllata
  if (Number.isInteger(num)) {
    return num.toLocaleString(undefined, {
      maximumFractionDigits: 0
    });
  }
  
  // Rimuovi zeri non significativi mantenendo precisione
  const formatted = Number(num.toPrecision(12))
    .toString()
    .replace(/\.?0+$/, '');
  
  return formatted;
} 