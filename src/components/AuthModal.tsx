import { X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext.tsx';

export function AuthModal() {
  const { authModalOpen, authMode, setAuthMode, closeAuthModal, login, signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authModalOpen) {
      setError(null);
      setSubmitting(false);
    }
  }, [authModalOpen, authMode]);

  useEffect(() => {
    if (!authModalOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAuthModal();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [authModalOpen, closeAuthModal]);

  if (!authModalOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (authMode === 'signup') {
        await signup(name, email, password);
      } else {
        await login(email, password);
      }
      setName('');
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to authenticate.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={closeAuthModal}
    >
      <div
        className="w-full max-w-md bg-[#131720] border border-white/15 rounded-xl p-6 sm:p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 pb-5 border-b border-white/10">
          <div>
            <p className="text-xs uppercase tracking-widest text-[#A1A1AA] font-medium">Member Account</p>
            <h2 id="auth-modal-title" className="font-display text-2xl font-semibold text-white mt-1">
              {authMode === 'login' ? 'Sign in to Cinema Gate' : 'Create your account'}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeAuthModal}
            aria-label="Close sign in dialog"
            className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg text-[#A1A1AA] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {authMode === 'signup' && (
            <div>
              <label htmlFor="auth-name" className="block text-sm font-medium text-[#E4E4E7] mb-1.5">
                Display Name
              </label>
              <input
                id="auth-name"
                type="text"
                required
                minLength={2}
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Rivera"
                className="w-full px-3.5 py-2.5 text-sm bg-[#0B0D11] border border-white/15 rounded-lg text-white placeholder:text-[#71717A] focus:outline-none focus:border-[#E5A00D]"
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-sm font-medium text-[#E4E4E7] mb-1.5">
              Email Address
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="viewer@cinemagate.example"
              className="w-full px-3.5 py-2.5 text-sm bg-[#0B0D11] border border-white/15 rounded-lg text-white placeholder:text-[#71717A] focus:outline-none focus:border-[#E5A00D]"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-sm font-medium text-[#E4E4E7] mb-1.5">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full px-3.5 py-2.5 text-sm bg-[#0B0D11] border border-white/15 rounded-lg text-white placeholder:text-[#71717A] focus:outline-none focus:border-[#E5A00D]"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="text-sm text-[#FCA5A5] bg-[#7F1D1D]/30 border border-[#EF4444]/35 rounded-lg px-3.5 py-2.5"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 text-sm font-semibold text-[#0B0D11] bg-[#E5A00D] rounded-lg hover:bg-[#F5B82E] disabled:opacity-60 transition-colors duration-150 cursor-pointer"
          >
            {submitting ? 'Please wait...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-white/10 flex items-center justify-between text-sm text-[#A1A1AA]">
          <span>{authMode === 'login' ? 'New to Cinema Gate?' : 'Already have an account?'}</span>
          <button
            type="button"
            onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
            className="font-medium text-[#E5A00D] hover:text-[#F5B82E] hover:underline cursor-pointer whitespace-nowrap"
          >
            {authMode === 'login' ? 'Create an account' : 'Sign in instead'}
          </button>
        </div>
      </div>
    </div>
  );
}
