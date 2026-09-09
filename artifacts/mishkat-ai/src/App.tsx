import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowUpLeft,
  BookOpen,
  Check,
  CircleHelp,
  Compass,
  Copy,
  Lightbulb,
  LibraryBig,
  Menu,
  MessageCircle,
  Moon,
  MoreHorizontal,
  Plus,
  RotateCcw,
  ScrollText,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import '@/index.css';
import { answerLocally, type AnswerDepth, type AnswerMode } from '@/lib/local-engine';

type Depth = 'مختصر' | 'متوازن' | 'متعمّق';
type Mode = 'استكشاف' | 'تعلّم' | 'تفكير';
type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  title?: string;
  points?: string[];
  signal?: string;
  depth?: Depth;
  sources?: { title: string; category: string; signal: string }[];
  followUps?: string[];
  confidence?: number;
};
type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
};

const queryClient = new QueryClient();
const STORAGE_KEY = 'mishkat-conversations-v1';

const suggestions = [
  { label: 'كيف أبدأ عادة القراءة؟', note: 'خطوات صغيرة تستمر', icon: BookOpen },
  { label: 'ما الفرق بين الحكمة والمعرفة؟', note: 'سؤال في المعنى', icon: Lightbulb },
  { label: 'كيف أتخذ قرارًا صعبًا؟', note: 'أداة للتفكير الهادئ', icon: Compass },
  { label: 'احكِ لي عن ابن الهيثم', note: 'نافذة على فكرة', icon: ScrollText },
];

const starter: Conversation = { id: 'welcome', title: 'مساحة جديدة', updatedAt: Date.now(), messages: [] };

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildAnswer(question: string, depth: Depth, mode: Mode): Message {
  const depthMap: Record<Depth, AnswerDepth> = {
    مختصر: 'مختصر',
    متوازن: 'متوازن',
    'متعمّق': 'متعمق',
  };
  const modeMap: Record<Mode, AnswerMode> = {
    استكشاف: 'واسع',
    'تعلّم': 'تعليمي',
    تفكير: 'عملي',
  };
  const result = answerLocally(question, modeMap[mode], depthMap[depth]);
  return {
    id: makeId(),
    role: 'assistant',
    title: result.matchedTopic,
    text: result.answer,
    sources: result.sources,
    followUps: result.followUps,
    confidence: result.confidence,
    signal: `${result.confidence}% ثقة محلية`,
    depth,
  };
}

function readConversations(): Conversation[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveConversations(items: Conversation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 18)));
}

function AppShell() {
  const [conversations, setConversations] = useState<Conversation[]>(readConversations);
  const [current, setCurrent] = useState<Conversation>(starter);
  const [question, setQuestion] = useState('');
  const [depth, setDepth] = useState<Depth>('متوازن');
  const [mode, setMode] = useState<Mode>('استكشاف');
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'ar';
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const hasConversation = current.messages.length > 0;
  const sortedConversations = useMemo(() => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt), [conversations]);

  const selectConversation = (conversation: Conversation) => {
    setCurrent(conversation);
    setSidebarOpen(false);
  };

  const createConversation = () => {
    setCurrent({ ...starter, id: makeId(), updatedAt: Date.now() });
    setQuestion('');
    setSidebarOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 80);
  };

  const submit = (value = question) => {
    const text = value.trim();
    if (!text || isTyping) return;
    const userMessage: Message = { id: makeId(), role: 'user', text };
    const nextMessages = [...current.messages, userMessage];
    const nextCurrent = { ...current, title: current.messages.length ? current.title : text.slice(0, 32), updatedAt: Date.now(), messages: nextMessages };
    setCurrent(nextCurrent);
    setQuestion('');
    setIsTyping(true);
    window.setTimeout(() => {
      const answer = buildAnswer(text, depth, mode);
      const finished = { ...nextCurrent, updatedAt: Date.now(), messages: [...nextMessages, answer] };
      setCurrent(finished);
      setConversations((previous) => {
        const updated = [finished, ...previous.filter((item) => item.id !== finished.id)];
        saveConversations(updated);
        return updated;
      });
      setIsTyping(false);
    }, 700);
  };

  const clearHistory = () => {
    if (!window.confirm('هل تريد حذف كل المحادثات المحفوظة على هذا الجهاز؟')) return;
    localStorage.removeItem(STORAGE_KEY);
    setConversations([]);
    createConversation();
  };

  return (
    <div className="mishkat-app">
      <aside className={`mishkat-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand-mark">
          <div className="brand-lamp"><LibraryBig size={20} strokeWidth={1.6} /></div>
          <div><div className="brand-name">مِشكاة</div><span className="brand-sub">مَعْرِفَةٌ تَقْتَرِبُ</span></div>
        </div>
        <button className="new-chat-btn" onClick={createConversation} data-testid="button-new-conversation">
          <span><Plus size={16} /> محادثة جديدة</span><ArrowUpLeft size={15} />
        </button>
        <div className="sidebar-label">المحفوظات</div>
        <div className="history-list">
          {sortedConversations.length === 0 ? (
            <div style={{ color: 'hsl(var(--sidebar-foreground) / .42)', fontSize: 11, padding: '11px 10px', lineHeight: 1.8 }}>ستظهر أسئلتك هنا لتعود إليها متى شئت.</div>
          ) : sortedConversations.map((item) => (
            <button className={`history-item ${item.id === current.id ? 'active' : ''}`} key={item.id} onClick={() => selectConversation(item)} data-testid={`button-history-${item.id}`}>
              <MessageCircle size={14} /><span>{item.title}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="privacy-note"><ShieldCheck size={16} /><span>خصوصيتك أصل. لا تسجيل دخول، ولا بيانات تغادر جهازك.</span></div>
          <button className="sidebar-action" onClick={clearHistory} data-testid="button-clear-history"><Trash2 size={14} /> مسح المحفوظات المحلية</button>
          <button className="sidebar-action" onClick={() => setDark((value) => !value)} data-testid="button-toggle-theme">{dark ? <Sun size={14} /> : <Moon size={14} />} {dark ? 'الوضع النهاري' : 'الوضع الليلي'}</button>
        </div>
      </aside>

      <section className="main-panel">
        <div className="mobile-header">
          <button className="icon-btn" onClick={() => setSidebarOpen(true)} aria-label="فتح القائمة" data-testid="button-open-menu"><Menu size={20} /></button>
          <div className="mobile-brand"><div className="brand-lamp"><LibraryBig size={16} /></div> مِشكاة</div>
          <button className="icon-btn" onClick={createConversation} aria-label="محادثة جديدة" data-testid="button-mobile-new"><Plus size={20} /></button>
        </div>
        <header className="topbar">
          <div className="topbar-title">{hasConversation ? current.title : 'مساحة للتفكير'}</div>
          <div className="topbar-actions">
            {hasConversation && <button className="icon-btn" onClick={createConversation} aria-label="محادثة جديدة" data-testid="button-top-new"><Plus size={18} /></button>}
            <button className="icon-btn" onClick={() => setDark((value) => !value)} aria-label="تبديل المظهر" data-testid="button-top-theme">{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
            <button className="icon-btn" aria-label="الإعدادات" data-testid="button-settings"><Settings2 size={17} /></button>
          </div>
        </header>

        <main className="content">
          {!hasConversation ? (
            <>
              <section className="welcome">
                <div className="eyebrow"><Sparkles size={13} /> مساعد مستقل، من داخل مِشكاة</div>
                <h1>أهلًا بك في <em>مِشكاة</em></h1>
                <p>اسأل كما تفكر. نرتّب لك الإجابة، ونترك لك مساحة لتتأملها.<br />من المعرفة إلى الحياة اليومية، هنا يبدأ السؤال الجيد.</p>
              </section>
              <section className="suggestions" aria-label="أسئلة مقترحة">
                {suggestions.map(({ label, note, icon: Icon }) => (
                  <button key={label} className="suggestion-card" onClick={() => submit(label)} data-testid={`button-suggestion-${label}`}>
                    <Icon className="suggestion-icon" size={18} strokeWidth={1.7} />
                    <strong>{label}</strong><small>{note}</small>
                  </button>
                ))}
              </section>
            </>
          ) : (
            <section className="conversation">
              <div className="conversation-header">
                <div><div className="eyebrow" style={{ marginBottom: 5 }}>جلسة معرفة</div><h2>{current.title}</h2></div>
                <button onClick={createConversation} data-testid="button-conversation-new"><Plus size={13} /> سؤال جديد</button>
              </div>
              {current.messages.map((message, index) => message.role === 'user' ? (
                <div className="message user" key={message.id}>
                  <div className="avatar user">أنت</div><div className="message-bubble" data-testid={`text-user-message-${message.id}`}>{message.text}</div>
                </div>
              ) : (
                <div className="message assistant" key={message.id}>
                  <div className="avatar assistant"><LibraryBig size={16} /></div>
                  <div className="message-bubble" data-testid={`text-assistant-message-${message.id}`}>
                    <div className="answer-meta"><span className="signal"><Sparkles size={11} /> {message.signal}</span><span>إجابة {message.depth}</span></div>
                    <h3 className="answer-title">{message.title}</h3>
                    <div className="answer-body">{message.text}</div>
                    {message.points && <ul className="answer-points">{message.points.map((point) => <li key={point}>{point}</li>)}</ul>}
                    {message.sources && message.sources.length > 0 && (
                      <div className="answer-sources">
                        <div className="sources-heading"><ScrollText size={13} /> إشارات المحرك المحلي</div>
                        <div className="source-chips">
                          {message.sources.map((source) => <span className="source-chip" key={source.title}><strong>{source.title}</strong><small>{source.category}</small></span>)}
                        </div>
                      </div>
                    )}
                    {message.followUps && message.followUps.length > 0 && (
                      <div className="follow-ups">
                        <span>يمكنك المتابعة بسؤال:</span>
                        {message.followUps.map((followUp) => <button key={followUp} onClick={() => submit(followUp)}>{followUp}<ArrowUpLeft size={12} /></button>)}
                      </div>
                    )}
                    <div className="answer-actions">
                      <button onClick={() => navigator.clipboard?.writeText(`${message.title}\n\n${message.text}`)} aria-label="نسخ الإجابة" data-testid={`button-copy-answer-${message.id}`}><Copy size={14} /></button>
                      <button aria-label="إجابة مفيدة" data-testid={`button-helpful-${message.id}`}><ThumbsUp size={14} /></button>
                      <button aria-label="إجابة غير مفيدة" data-testid={`button-not-helpful-${message.id}`}><ThumbsDown size={14} /></button>
                      <button onClick={() => submit(current.messages[index - 1]?.role === 'user' ? current.messages[index - 1].text : '')} aria-label="إعادة السؤال" data-testid={`button-retry-answer-${message.id}`}><RotateCcw size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
              {isTyping && <div className="message assistant"><div className="avatar assistant"><LibraryBig size={16} /></div><div className="typing" aria-label="يكتب"><i /><i /><i /></div></div>}
            </section>
          )}

          <div className="composer-wrap">
            <form className="composer" onSubmit={(event) => { event.preventDefault(); submit(); }}>
              <textarea ref={inputRef} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder="ما الذي يدور في بالك؟" aria-label="اكتب سؤالك" data-testid="input-question" />
              <div className="composer-toolbar">
                <div className="toolbar-right">
                  <select className="depth-select" value={depth} onChange={(event) => setDepth(event.target.value as Depth)} aria-label="عمق الإجابة" data-testid="select-depth">
                    <option>مختصر</option><option>متوازن</option><option>متعمّق</option>
                  </select>
                  <select className="mode-select" value={mode} onChange={(event) => setMode(event.target.value as Mode)} aria-label="نمط المساعدة" data-testid="select-mode">
                    <option>استكشاف</option><option>تعلّم</option><option>تفكير</option>
                  </select>
                </div>
                <div className="toolbar-left"><span style={{ color: 'hsl(var(--muted-foreground) / .7)', fontSize: 10 }}>Enter للإرسال</span><button className="send-btn" type="submit" disabled={!question.trim() || isTyping} aria-label="إرسال السؤال" data-testid="button-send"><Send size={16} /></button></div>
              </div>
            </form>
            <div className="composer-footnote"><ShieldCheck size={11} style={{ verticalAlign: '-2px', marginLeft: 4 }} /> يعمل محليًا على جهازك · لا يستخدم مزوّدات ذكاء اصطناعي خارجية</div>
          </div>
        </main>
      </section>
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={AppShell} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;