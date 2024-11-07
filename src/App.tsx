import { Button } from "@/components/ui/button"
import { useState, useEffect, useCallback } from "react"
import { Sun, Moon, Delete, Copy, Check, Github, Calculator, FunctionSquare } from "lucide-react"
import { motion, AnimatePresence, useWillChange } from "framer-motion"
import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

// Cache per risultati recenti
const resultCache = new Map<string, number>();

// Aggiungi questo enum all'inizio del file, dopo gli import
enum CalculationError {
  DOMAIN = 'Domain error',
  UNDEFINED = 'Undefined',
  SYNTAX = 'Syntax error',
  OVERFLOW = 'Overflow',
  INVALID = 'Invalid expression',
  UNKNOWN = 'Unknown error'
}

// Contesto matematico per le operazioni
const mathContext = {
  ...Math,
  // Funzioni trigonometriche (input in gradi)
  sin: (x: number) => {
    // Normalizza l'angolo tra 0 e 360
    const normalized = ((x % 360) + 360) % 360;
    return Math.sin((normalized * Math.PI) / 180);
  },
  cos: (x: number) => {
    // Normalizza l'angolo tra 0 e 360
    const normalized = ((x % 360) + 360) % 360;
    
    // Gestione speciale per angoli notevoli
    if (normalized === 0 || normalized === 360) return 1;
    if (normalized === 90 || normalized === 270) return 0;
    if (normalized === 180) return -1;
    if (normalized === 60 || normalized === 300) return 0.5;
    if (normalized === 120 || normalized === 240) return -0.5;
    
    return Math.cos((normalized * Math.PI) / 180);
  },
  tan: (x: number) => {
    // Normalizza l'angolo tra 0 e 360
    const normalized = ((x % 360) + 360) % 360;
    
    // Gestione asintoti verticali (90° e 270°)
    if (Math.abs(normalized - 90) < 1e-10 || Math.abs(normalized - 270) < 1e-10) {
      throw new Error(CalculationError.UNDEFINED);
    }
    
    // Gestione speciale per angoli notevoli
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

// Aggiorna safeEvaluate per utilizzare i nuovi tipi di errore
const safeEvaluate = (expression: string): number => {
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
      // Migliore gestione degli errori specifici
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
        throw new Error('Math Error');
      }
      throw new Error(CalculationError.SYNTAX);
    }
    throw new Error(CalculationError.UNKNOWN);
  }
}

const formatNumber = (num: number): string => {
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

// Costante per la chiave del localStorage
const THEME_KEY = 'calculator-theme';

function App() {
  const [display, setDisplay] = useState<string>('0')
  const [equation, setEquation] = useState<string>('')
  const [isDark, setIsDark] = useState(() => {
    // Verifica prima il localStorage
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved === 'dark';
    // Altrimenti usa le preferenze del sistema
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const willChange = useWillChange()
  const [isCopied, setIsCopied] = useState(false)
  const [isScientific, setIsScientific] = useState(() => {
    const saved = localStorage.getItem('calculator-mode');
    return saved === 'scientific';
  });
  
  // Effetto per sincronizzare il tema
  useEffect(() => {
    // Rimuovi tutte le classi di tema
    document.documentElement.classList.remove('dark', 'light');
    
    // Applica il nuovo tema
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem(THEME_KEY, 'dark');
    } else {
      localStorage.setItem(THEME_KEY, 'light');
    }
  }, [isDark]);

  const handleNumber = useCallback((num: string) => {
    if (display.length >= 16) {
      // Aggiungere feedback visivo
      const displayElement = document.querySelector('.calculator-display');
      displayElement?.classList.add('shake');
      setTimeout(() => displayElement?.classList.remove('shake'), 500);
      return;
    }
    if (num === '.' && display.includes('.')) return
    if (display === '0' && num !== '.') {
      setDisplay(num)
    } else {
      setDisplay(display + num)
    }
  }, [display]);

  const handleOperator = useCallback((op: string) => {
    if (display === 'Error') return;
    
    // Gestione costanti matematiche
    if (op === 'Math.PI' || op === 'Math.E') {
      const value = op === 'Math.PI' ? Math.PI : Math.E;
      setDisplay(formatNumber(value));
      return;
    }
    
    // Gestione funzioni matematiche
    if (op.startsWith('Math.')) {
      try {
        const currentValue = parseFloat(display);
        let result;

        // Gestione diretta delle funzioni matematiche
        switch(op) {
          case 'Math.log10(':
          case 'Math.log(':
            result = mathContext.log(currentValue);
            break;
          case 'Math.ln(':
            result = mathContext.ln(currentValue);
            break;
          case 'Math.sin(':
            result = mathContext.sin(currentValue);
            break;
          case 'Math.cos(':
            result = mathContext.cos(currentValue);
            break;
          case 'Math.tan(':
            result = mathContext.tan(currentValue);
            break;
          case 'Math.sqrt(':
            result = mathContext.sqrt(currentValue);
            break;
          case 'Math.pow(':
            result = mathContext.pow(currentValue, 2);
            break;
          default:
            throw new Error('Invalid function');
        }

        setDisplay(formatNumber(result));
        setEquation('');
      } catch (error) {
        setDisplay(error instanceof Error ? error.message : 'Error');
        setEquation('');
      }
      return;
    }
    
    // Gestione parentesi migliorata
    if (op === '(' || op === ')') {
      let newEquation = equation;
      
      if (display !== '0' && display !== 'Error') {
        newEquation += display;
      }
      
      newEquation += op;
      
      const openCount = (newEquation.match(/\(/g) || []).length;
      const closeCount = (newEquation.match(/\)/g) || []).length;
      
      if (op === ')' && closeCount > openCount) {
        setDisplay('Syntax Error');
        return;
      }
      
      setEquation(newEquation);
      setDisplay('0');
      return;
    }
    
    // Gestione operatori standard
    if (equation && display !== '0') {
      try {
        const result = safeEvaluate(equation + display);
        setEquation(formatNumber(result) + ' ' + op + ' ');
        setDisplay('0');
      } catch (error) {
        setDisplay(error instanceof Error ? error.message : 'Error');
        setEquation('');
      }
    } else {
      setEquation((display === '0' ? '0' : display) + ' ' + op + ' ');
      setDisplay('0');
    }
  }, [display, equation]);

  const calculate = useCallback(() => {
    if (!equation || display === 'Error') {
      setDisplay('0');
      setEquation('');
      return;
    }

    try {
      const result = safeEvaluate(equation + display);
      if (!isFinite(result)) {
        setDisplay('Math Error');
        setEquation('');
        return;
      }

      setDisplay(formatNumber(result));
      setEquation('');
    } catch (error: unknown) {
      if (error instanceof Error) {
        setDisplay(error.message);
      } else {
        setDisplay('Syntax Error');
      }
      setEquation('');
    }
  }, [display, equation]);

  const clear = useCallback(() => {
    setDisplay('0')
    setEquation('')
  }, []);

  // Toggle del tema
  const toggleTheme = useCallback(() => {
    setIsDark(prev => {
      const newValue = !prev;
      // Non modificare direttamente il DOM qui
      return newValue;
    });
  }, []);

  const toggleScientific = () => {
    setIsScientific(prev => {
      const newValue = !prev;
      localStorage.setItem('calculator-mode', newValue ? 'scientific' : 'simple');
      return newValue;
    });
  }

  const getFontSize = (length: number) => {
    if (length > 15) return 'text-lg'
    if (length > 10) return 'text-2xl'
    return 'text-3xl'
  }

  const handleBackspace = useCallback(() => {
    if (display === 'Error') {
      setDisplay('0');
      setEquation('');
      return;
    }
    if (display.length === 1) {
      setDisplay('0');
    } else {
      setDisplay(display.slice(0, -1));
    }
  }, [display]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(display)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Modifica la funzione simulateButtonClick per gestire pressione e rilascio
  const simulateButtonClick = useCallback((buttonSelector: string, isPressed: boolean) => {
    const button = document.querySelector(buttonSelector) as HTMLButtonElement;
    if (button) {
      if (isPressed) {
        // Stile quando il tasto è premuto
        button.style.transform = 'scale(0.98) translateY(2px)';
        button.style.boxShadow = '0 0 0 0';
      } else {
        // Ripristina lo stile quando il tasto è rilasciato
        button.style.transform = '';
        button.style.boxShadow = '';
      }
    }
  }, []);

  // Modifica l'useEffect per gestire sia keydown che keyup
  useEffect(() => {
    const handleKeyAction = (e: KeyboardEvent, isKeyDown: boolean) => {
      if (e.repeat) return; // Ignora gli eventi di ripetizione automatica
      
      if (e.key === 'Enter' || e.key === '=' || e.key === 'Escape') {
        e.preventDefault();
      }

      // Numeri e punto decimale
      if (/^[0-9.]$/.test(e.key)) {
        if (isKeyDown) handleNumber(e.key);
        simulateButtonClick(`[data-key="${e.key}"]`, isKeyDown);
        return;
      }

      // Operatori
      switch (e.key) {
        case '+':
          if (isKeyDown) handleOperator('+');
          simulateButtonClick('[data-key="+"]', isKeyDown);
          break;
        case '-':
          if (isKeyDown) handleOperator('-');
          simulateButtonClick('[data-key="-"]', isKeyDown);
          break;
        case '*':
          if (isKeyDown) handleOperator('*');
          simulateButtonClick('[data-key="*"]', isKeyDown);
          break;
        case '/':
          if (isKeyDown) handleOperator('/');
          simulateButtonClick('[data-key="/"]', isKeyDown);
          break;
        case 'Enter':
        case '=':
          if (isKeyDown) calculate();
          simulateButtonClick('[data-key="="]', isKeyDown);
          break;
        case 'Escape':
          if (isKeyDown) clear();
          simulateButtonClick('[data-key="AC"]', isKeyDown);
          break;
        case 'Backspace':
          if (isKeyDown) handleBackspace();
          simulateButtonClick('[data-key="backspace"]', isKeyDown);
          break;
        // Funzioni scientifiche
        case 's':
          if (isScientific && e.ctrlKey) {
            if (isKeyDown) handleOperator('Math.sin(');
            simulateButtonClick('[data-key="sin"]', isKeyDown);
          }
          break;
        case 'c':
          if (isScientific && e.ctrlKey) {
            if (isKeyDown) handleOperator('Math.cos(');
            simulateButtonClick('[data-key="cos"]', isKeyDown);
          }
          break;
        case 't':
          if (isScientific && e.ctrlKey) {
            if (isKeyDown) handleOperator('Math.tan(');
            simulateButtonClick('[data-key="tan"]', isKeyDown);
          }
          break;
        case 'l':
          if (isScientific && e.ctrlKey) {
            if (isKeyDown) handleOperator('Math.log10(');
            simulateButtonClick('[data-key="log"]', isKeyDown);
          }
          break;
        case 'n':
          if (isScientific && e.ctrlKey) {
            if (isKeyDown) handleOperator('Math.ln(');
            simulateButtonClick('[data-key="ln"]', isKeyDown);
          }
          break;
        case 'p':
          if (isScientific && e.ctrlKey) {
            if (isKeyDown) handleOperator('Math.PI');
            simulateButtonClick('[data-key="pi"]', isKeyDown);
          }
          break;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => handleKeyAction(e, true);
    const handleKeyUp = (e: KeyboardEvent) => handleKeyAction(e, false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    display,
    isScientific,
    calculate,
    handleBackspace,
    handleNumber,
    handleOperator,
    clear,
    simulateButtonClick
  ]);

  return (
    <>
      <motion.div 
        style={{ willChange }}
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }}
        className={`min-h-[100dvh] flex flex-col items-center justify-center p-4 relative
          ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}
      >
        <div className="absolute top-4 right-4 flex gap-2">
          <TooltipProvider>
            <TooltipRoot>
              <TooltipTrigger asChild>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button 
                    variant="outline" 
                    size="icon"
                    aria-label="Modalità scientifica"
                    className={`border-2 ${
                      isDark 
                        ? 'bg-slate-800 text-white hover:bg-slate-700 hover:text-white border-slate-600' 
                        : 'bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900 border-slate-300'
                    }`}
                    onClick={toggleScientific}
                  >
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={isScientific ? 'scientific' : 'simple'}
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 20, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        {isScientific ? 
                          <Calculator className="h-5 w-5" /> : 
                          <FunctionSquare className="h-5 w-5" />
                        }
                      </motion.div>
                    </AnimatePresence>
                  </Button>
                </motion.div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isScientific ? 'Modalità semplice' : 'Modalità scientifica'}
              </TooltipContent>
            </TooltipRoot>

            <TooltipRoot>
              <TooltipTrigger asChild>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button 
                    variant="outline" 
                    size="icon" 
                    aria-label="Cambia tema"
                    className={`border-2
                      ${isDark 
                        ? 'bg-slate-800 text-white hover:bg-slate-700 hover:text-white border-slate-600' 
                        : 'bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900 border-slate-300'
                      }`}
                    onClick={toggleTheme}
                  >
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={isDark ? 'dark' : 'light'}
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 20, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                      </motion.div>
                    </AnimatePresence>
                  </Button>
                </motion.div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isDark ? 'Tema chiaro' : 'Tema scuro'}
              </TooltipContent>
            </TooltipRoot>
          </TooltipProvider>
        </div>

        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className={`p-4 sm:p-6 rounded-2xl shadow-xl w-full ${
            isScientific ? 'max-w-[420px]' : 'max-w-[320px]'
          } ${
            isDark 
              ? 'bg-slate-800 shadow-slate-900/20' 
              : 'bg-white shadow-slate-200/60'
          }`}
        >
          <motion.div 
            layout
            layoutId="display"
            className={`p-4 rounded-lg mb-4 overflow-hidden select-none relative
              ${isDark 
                ? 'bg-slate-700/80 ring-1 ring-slate-600/50' 
                : 'bg-slate-100 ring-1 ring-slate-200/50'
              }`}
          >
            <motion.div 
              layout
              layoutId="equation"
              className={`text-sm h-6 overflow-hidden text-ellipsis whitespace-nowrap select-none
                ${isDark ? 'text-slate-400' : 'text-slate-600'}`}
            >
              {equation}
            </motion.div>
            <div className="absolute top-3 right-3">
              <motion.div
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-6 w-6 ${
                    isDark 
                      ? 'hover:bg-slate-600 text-slate-400' 
                      : 'hover:bg-slate-300 text-slate-500'
                  }`}
                  onClick={handleCopy}
                  data-key="copy"
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={isCopied ? 'check' : 'copy'}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                    >
                      {isCopied ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </Button>
              </motion.div>
            </div>
            <motion.div 
              layout
              layoutId="result"
              data-testid="display"
              className={`font-miracode font-bold text-right overflow-hidden text-ellipsis whitespace-nowrap select-none
                ${getFontSize(display.length)}
                ${isDark ? 'text-white' : 'text-slate-900'}`}
            >
              {display}
            </motion.div>
          </motion.div>
          
          <div className="grid grid-cols-4 gap-1 sm:gap-2">
            {/* Pulsanti scientifici */}
            {isScientific && (
              <>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }}>
                  <Button 
                    variant="secondary"
                    onClick={() => handleOperator('Math.sin(')}
                    data-key="sin"
                    className={`w-full shadow-[0_4px_0_0] select-none ${
                      isDark 
                        ? 'shadow-slate-700 active:shadow-[0_0_0_0] active:translate-y-1' 
                        : 'shadow-slate-200 active:shadow-[0_0_0_0] active:translate-y-1'
                    }`}
                  >
                    sin
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }}>
                  <Button 
                    variant="secondary"
                    onClick={() => handleOperator('Math.cos(')}
                    data-key="cos"
                    className={`w-full shadow-[0_4px_0_0] select-none ${
                      isDark 
                        ? 'shadow-slate-700 active:shadow-[0_0_0_0] active:translate-y-1' 
                        : 'shadow-slate-200 active:shadow-[0_0_0_0] active:translate-y-1'
                    }`}
                  >
                    cos
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }}>
                  <Button 
                    variant="secondary"
                    onClick={() => handleOperator('Math.tan(')}
                    data-key="tan"
                    className={`w-full shadow-[0_4px_0_0] select-none ${
                      isDark 
                        ? 'shadow-slate-700 active:shadow-[0_0_0_0] active:translate-y-1' 
                        : 'shadow-slate-200 active:shadow-[0_0_0_0] active:translate-y-1'
                    }`}
                  >
                    tan
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }}>
                  <Button 
                    variant="secondary"
                    onClick={() => handleOperator('Math.ln(')}
                    data-key="ln"
                    className={`w-full shadow-[0_4px_0_0] select-none ${
                      isDark 
                        ? 'shadow-slate-700 active:shadow-[0_0_0_0] active:translate-y-1' 
                        : 'shadow-slate-200 active:shadow-[0_0_0_0] active:translate-y-1'
                    }`}
                  >
                    ln
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }}>
                  <Button 
                    variant="secondary"
                    onClick={() => handleOperator('Math.log10(')}
                    data-key="log"
                    className={`w-full shadow-[0_4px_0_0] select-none ${
                      isDark 
                        ? 'shadow-slate-700 active:shadow-[0_0_0_0] active:translate-y-1' 
                        : 'shadow-slate-200 active:shadow-[0_0_0_0] active:translate-y-1'
                    }`}
                  >
                    log
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }}>
                  <Button 
                    variant="secondary"
                    onClick={() => handleOperator('Math.sqrt(')}
                    data-key="sqrt"
                    className={`w-full shadow-[0_4px_0_0] select-none ${
                      isDark 
                        ? 'shadow-slate-700 active:shadow-[0_0_0_0] active:translate-y-1' 
                        : 'shadow-slate-200 active:shadow-[0_0_0_0] active:translate-y-1'
                    }`}
                  >
                    √
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }}>
                  <Button 
                    variant="secondary"
                    onClick={() => handleOperator('Math.pow(')}
                    data-key="pow"
                    className={`w-full shadow-[0_4px_0_0] select-none ${
                      isDark 
                        ? 'shadow-slate-700 active:shadow-[0_0_0_0] active:translate-y-1' 
                        : 'shadow-slate-200 active:shadow-[0_0_0_0] active:translate-y-1'
                    }`}
                  >
                    x
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }}>
                  <Button 
                    variant="secondary"
                    onClick={() => handleOperator('Math.PI')}
                    data-key="pi"
                    className={`w-full shadow-[0_4px_0_0] select-none ${
                      isDark 
                        ? 'shadow-slate-700 active:shadow-[0_0_0_0] active:translate-y-1' 
                        : 'shadow-slate-200 active:shadow-[0_0_0_0] active:translate-y-1'
                    }`}
                  >
                    π
                  </Button>
                </motion.div>
              </>
            )}

            {/* Pulsanti standard */}
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }}>
              <Button 
                variant="outline" 
                onClick={clear}
                data-key="AC"
                className={`w-full shadow-[0_4px_0_0] select-none ${
                  isDark 
                    ? 'shadow-slate-700 active:shadow-[0_0_0_0] active:translate-y-1' 
                    : 'shadow-slate-200 active:shadow-[0_0_0_0] active:translate-y-1'
                }`}
              >
                AC
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }}>
              <Button 
                variant="outline" 
                onClick={handleBackspace}
                data-key="backspace"
                className={`w-full shadow-[0_4px_0_0] select-none ${
                  isDark 
                    ? 'shadow-slate-700 active:shadow-[0_0_0_0] active:translate-y-1' 
                    : 'shadow-slate-200 active:shadow-[0_0_0_0] active:translate-y-1'
                }`}
              >
                <Delete className="h-4 w-4" />
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }}>
              <Button 
                variant="secondary" 
                onClick={() => handleOperator('/')}
                data-key="/"
                className={`w-full shadow-[0_4px_0_0] select-none ${
                  isDark 
                    ? 'shadow-slate-700 active:shadow-[0_0_0_0] active:translate-y-1' 
                    : 'shadow-slate-200 active:shadow-[0_0_0_0] active:translate-y-1'
                }`}
              >
                /
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }}>
              <Button 
                variant="secondary" 
                onClick={() => handleOperator('*')}
                data-key="*"
                className={`w-full shadow-[0_4px_0_0] select-none ${
                  isDark 
                    ? 'shadow-slate-700 active:shadow-[0_0_0_0] active:translate-y-1' 
                    : 'shadow-slate-200 active:shadow-[0_0_0_0] active:translate-y-1'
                }`}
              >
                ×
              </Button>
            </motion.div>

            {/* Seconda riga */}
            {[7,8,9].map((num) => (
              <motion.div key={num} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }}>
                <Button 
                  variant="outline" 
                  onClick={() => handleNumber(String(num))}
                  data-key={String(num)}
                  className={`w-full shadow-[0_4px_0_0] font-miracode select-none ${
                    isDark 
                      ? 'shadow-slate-700 active:shadow-[0_0_0_0] active:translate-y-1' 
                      : 'shadow-slate-200 active:shadow-[0_0_0_0] active:translate-y-1'
                  }`}
                >
                  {num}
                </Button>
              </motion.div>
            ))}
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }}>
              <Button 
                variant="secondary" 
                onClick={() => handleOperator('-')}
                data-key="-"
                className={`w-full shadow-[0_4px_0_0] select-none ${
                  isDark 
                    ? 'shadow-slate-700 active:shadow-[0_0_0_0] active:translate-y-1' 
                    : 'shadow-slate-200 active:shadow-[0_0_0_0] active:translate-y-1'
                }`}
              >
                -
              </Button>
            </motion.div>

            {/* Terza riga */}
            {[4,5,6].map((num) => (
              <motion.div key={num} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }}>
                <Button 
                  variant="outline" 
                  onClick={() => handleNumber(String(num))}
                  data-key={String(num)}
                  className={`w-full shadow-[0_4px_0_0] font-miracode select-none ${
                    isDark 
                      ? 'shadow-slate-700 active:shadow-[0_0_0_0] active:translate-y-1' 
                      : 'shadow-slate-200 active:shadow-[0_0_0_0] active:translate-y-1'
                  }`}
                >
                  {num}
                </Button>
              </motion.div>
            ))}
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }}>
              <Button 
                variant="secondary" 
                onClick={() => handleOperator('+')}
                data-key="+"
                className={`w-full shadow-[0_4px_0_0] select-none ${
                  isDark 
                    ? 'shadow-slate-700 active:shadow-[0_0_0_0] active:translate-y-1' 
                    : 'shadow-slate-200 active:shadow-[0_0_0_0] active:translate-y-1'
                }`}
              >
                +
              </Button>
            </motion.div>

            {/* Quarta riga */}
            {[1,2,3].map((num) => (
              <motion.div key={num} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }}>
                <Button 
                  variant="outline" 
                  onClick={() => handleNumber(String(num))}
                  data-key={String(num)}
                  className={`w-full shadow-[0_4px_0_0] font-miracode select-none ${
                    isDark 
                      ? 'shadow-slate-700 active:shadow-[0_0_0_0] active:translate-y-1' 
                      : 'shadow-slate-200 active:shadow-[0_0_0_0] active:translate-y-1'
                  }`}
                >
                  {num}
                </Button>
              </motion.div>
            ))}
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }} className="row-span-2">
              <Button 
                variant="default" 
                onClick={calculate} 
                data-key="="
                className={`h-full w-full shadow-[0_6px_0_0] select-none transition-all duration-150
                  ${isDark 
                    ? 'shadow-blue-900/80 active:shadow-[0_0_0_0] active:translate-y-1 bg-blue-600 hover:bg-blue-500 text-white' 
                    : 'shadow-blue-200/80 active:shadow-[0_0_0_0] active:translate-y-1 bg-blue-500 hover:bg-blue-400 text-white'
                  }`}
              >
                =
              </Button>
            </motion.div>

            {/* Ultima riga */}
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }} className="col-span-2">
              <Button 
                variant="outline" 
                onClick={() => handleNumber('0')}
                data-key="0"
                className={`w-full shadow-[0_4px_0_0] font-miracode select-none ${
                  isDark 
                    ? 'shadow-slate-700 active:shadow-[0_0_0_0] active:translate-y-1' 
                    : 'shadow-slate-200 active:shadow-[0_0_0_0] active:translate-y-1'
                }`}
              >
                0
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98, y: 2 }}>
              <Button 
                variant="outline" 
                onClick={() => handleNumber('.')}
                data-key="."
                className={`w-full shadow-[0_4px_0_0] font-miracode select-none ${
                  isDark 
                    ? 'shadow-slate-700 active:shadow-[0_0_0_0] active:translate-y-1' 
                    : 'shadow-slate-200 active:shadow-[0_0_0_0] active:translate-y-1'
                }`}
              >
                .
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>

      {/* Footer */}
      <div className={`fixed bottom-2 sm:bottom-4 left-0 right-0 text-center flex items-center justify-center gap-2 select-none text-xs sm:text-sm
        ${isDark ? 'text-slate-400' : 'text-slate-600'}`}
      >
        <span className="font-miracode text-sm flex items-center">Made by devchristian1337</span>
        <motion.a
          href="https://github.com/devchristian1337"
          target="_blank"
          rel="noopener noreferrer"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className={`inline-flex items-center justify-center -mt-[1px]
            ${isDark ? 'text-slate-400 hover:text-slate-300' : 'text-slate-600 hover:text-slate-800'}`}
        >
          <Github className="h-4 w-4" />
        </motion.a>
      </div>

      {/* Keyboard Shortcuts Help */}
      {isScientific && (
        <div className={`fixed bottom-12 sm:bottom-16 left-0 right-0 text-center flex items-center justify-center gap-2 select-none text-xs
          ${isDark ? 'text-slate-400' : 'text-slate-600'}`}
        >
          <span>Shortcuts: </span>
          <span>Ctrl + S (sin)</span>
          <span>•</span>
          <span>Ctrl + C (cos)</span>
          <span>•</span>
          <span>Ctrl + T (tan)</span>
          <span>•</span>
          <span>Ctrl + L (log)</span>
          <span>•</span>
          <span>Ctrl + N (ln)</span>
          <span>•</span>
          <span>Ctrl + P (π)</span>
        </div>
      )}
    </>
  )
}

export default App