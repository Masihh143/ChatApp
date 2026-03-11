import { useState } from 'react';

export default function AuthScreen({ onAuth, apiBase }) {
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onAuth(isRegister, form);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center"
         style={{ backgroundColor: 'var(--wa-bg)' }}>
      {/* Green top strip like WhatsApp */}
      <div className="fixed top-0 left-0 right-0 h-[220px]"
           style={{ backgroundColor: 'var(--wa-green-dark)' }} />

      <div className="relative z-10 w-full max-w-[420px] mx-4 rounded-md overflow-hidden shadow-2xl"
           style={{ backgroundColor: 'var(--wa-panel)' }}>
        {/* Header */}
        <div className="flex flex-col items-center pt-10 pb-6 px-8">
          {/* WhatsApp-style logo */}
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
               style={{ backgroundColor: 'var(--wa-green)' }}>
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-white" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12c0 1.82.49 3.53 1.34 5L2 22l5.12-1.34A9.96 9.96 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm.97 14.95l-.02.01c-1.29.62-2.75.35-3.78-.68l-.02-.02c-1.03-1.03-1.3-2.49-.68-3.78l.01-.02c.14-.29.33-.56.56-.79l.53-.53c.2-.2.51-.2.71 0l1.41 1.41c.2.2.2.51 0 .71l-.53.53c-.1.1-.15.24-.12.38.11.48.38.92.78 1.24.32.4.76.67 1.24.78.14.03.28-.02.38-.12l.53-.53c.2-.2.51-.2.71 0l1.41 1.41c.2.2.2.51 0 .71l-.53.53c-.23.23-.5.42-.79.56z"/>
            </svg>
          </div>
          <h1 className="text-xl font-light tracking-wide"
              style={{ color: 'var(--wa-text-primary)' }}>
            {isRegister ? 'Create your account' : 'Sign in to ChatApp'}
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 pb-8">
          {error && (
            <div className="mb-4 rounded px-3 py-2 text-sm"
                 style={{ backgroundColor: 'rgba(234,67,53,0.15)', color: 'var(--wa-danger)' }}>
              {error}
            </div>
          )}

          {isRegister && (
            <div className="mb-4">
              <label className="block text-xs mb-1.5 font-medium"
                     style={{ color: 'var(--wa-green)' }}>
                Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full rounded px-3 py-2.5 text-sm transition-colors"
                style={{
                  backgroundColor: 'var(--wa-input)',
                  color: 'var(--wa-text-primary)',
                  border: '1px solid var(--wa-input-border)',
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--wa-green)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--wa-input-border)'}
                required
              />
            </div>
          )}

          <div className="mb-4">
            <label className="block text-xs mb-1.5 font-medium"
                   style={{ color: 'var(--wa-green)' }}>
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className="w-full rounded px-3 py-2.5 text-sm transition-colors"
              style={{
                backgroundColor: 'var(--wa-input)',
                color: 'var(--wa-text-primary)',
                border: '1px solid var(--wa-input-border)',
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--wa-green)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--wa-input-border)'}
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-xs mb-1.5 font-medium"
                   style={{ color: 'var(--wa-green)' }}>
              Password
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => handleChange('password', e.target.value)}
              className="w-full rounded px-3 py-2.5 text-sm transition-colors"
              style={{
                backgroundColor: 'var(--wa-input)',
                color: 'var(--wa-text-primary)',
                border: '1px solid var(--wa-input-border)',
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--wa-green)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--wa-input-border)'}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded py-2.5 text-sm font-medium transition-colors cursor-pointer"
            style={{
              backgroundColor: 'var(--wa-green)',
              color: '#fff',
              opacity: loading ? 0.6 : 1,
            }}
            onMouseOver={(e) => !loading && (e.target.style.backgroundColor = 'var(--wa-green-hover)')}
            onMouseOut={(e) => (e.target.style.backgroundColor = 'var(--wa-green)')}
          >
            {loading ? '...' : isRegister ? 'SIGN UP' : 'SIGN IN'}
          </button>

          <div className="mt-5 text-center">
            <span className="text-xs cursor-pointer transition-colors"
                  style={{ color: 'var(--wa-text-secondary)' }}
                  onClick={() => { setIsRegister((v) => !v); setError(''); }}
                  onMouseOver={(e) => e.target.style.color = 'var(--wa-green)'}
                  onMouseOut={(e) => e.target.style.color = 'var(--wa-text-secondary)'}
            >
              {isRegister
                ? 'Already have an account? Sign in'
                : "Don't have an account? Create one"}
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
