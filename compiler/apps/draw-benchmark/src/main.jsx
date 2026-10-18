import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import Editor from './Editor';
import './style.css';
import { installBenchmark } from './runner';
flushSync(() => createRoot(document.getElementById('root')).render(<Editor />));
installBenchmark();
