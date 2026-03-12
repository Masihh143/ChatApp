import { useState } from 'react';

export default function AuthScreen({ onAuth, theme, toggleTheme }) {
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
            setError(err.response?.data?.error || err.response?.data?.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex h-screen w-screen items-center justify-center doodle-bg">
            {/* Theme toggle */}
            <button
                onClick={toggleTheme}
                className="absolute top-4 right-4 z-20 p-2.5 rounded-full cursor-pointer transition-all duration-200 wiggle"
                style={{ color: 'var(--dd-text-secondary)', background: 'var(--dd-card)', border: '2px dashed var(--dd-border)', boxShadow: 'var(--dd-shadow-sm)' }}
                onMouseOver={(e) => { e.currentTarget.style.color = 'var(--dd-primary)'; e.currentTarget.style.borderColor = 'var(--dd-lavender)'; }}
                onMouseOut={(e) => { e.currentTarget.style.color = 'var(--dd-text-secondary)'; e.currentTarget.style.borderColor = 'var(--dd-border)'; }}
                title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
                {theme === 'light' ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" /></svg>
                ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z" /></svg>
                )}
            </button>
            {/* Decorative doodles */}
            <div className="absolute top-[15%] left-[10%] text-6xl opacity-20 select-none" style={{ fontFamily: 'var(--font-hand)' }}>😂</div>
            <div className="absolute bottom-[20%] right-[12%] text-5xl opacity-15 select-none" style={{ fontFamily: 'var(--font-hand)' }}>😵‍💫</div>
            <div className="absolute top-[30%] right-[20%] text-4xl opacity-10 select-none" style={{ fontFamily: 'var(--font-hand)' }}>🥺</div>
            <div className="absolute bottom-[35%] left-[15%] text-3xl opacity-15 select-none" style={{ fontFamily: 'var(--font-hand)' }}>🥴</div>

            {/* Auth card */}
            <div className="relative z-10 w-full max-w-[400px] mx-4 sketch-card p-8">
                {/* Header */}
                <div className="flex flex-col items-center mb-6">
                    {/* Doodle chat icon */}
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3 doodle-avatar"
                        style={{ backgroundColor: 'var(--dd-lavender-soft)', borderColor: 'var(--dd-lavender)' }}>
                        <span className="text-3xl">💬</span>
                    </div>

                    <h1 className="text-3xl font-bold"
                        style={{ fontFamily: 'var(--font-hand)', color: 'var(--dd-primary)' }}>
                        {isRegister ? 'Join the chat!' : 'Welcome back!'}
                    </h1>
                    <p className="text-sm mt-1"
                        style={{ color: 'var(--dd-text-secondary)', fontFamily: 'var(--font-sketch)' }}>
                        {isRegister ? 'Create your cozy corner ✨' : 'Sign in to your cozy corner ✨'}
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit}>
                    {error && (
                        <div className="mb-4 rounded-xl px-3 py-2 text-sm"
                            style={{ background: 'var(--dd-coral-soft)', color: 'var(--dd-danger)', border: '1px dashed var(--dd-coral)', fontFamily: 'var(--font-sketch)' }}>
                            Oops! {error}
                        </div>
                    )}

                    {isRegister && (
                        <div className="mb-4">
                            <label className="block text-xs mb-1 font-bold tracking-wide uppercase"
                                style={{ color: 'var(--dd-text-secondary)', fontFamily: 'var(--font-body)' }}>
                                Your Name
                            </label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={(e) => handleChange('name', e.target.value)}
                                className="w-full px-4 py-2.5 text-sm doodle-input"
                                style={{ color: 'var(--dd-text)' }}
                                placeholder="What should we call you?"
                                required
                            />
                        </div>
                    )}

                    <div className="mb-4">
                        <label className="block text-xs mb-1 font-bold tracking-wide uppercase"
                            style={{ color: 'var(--dd-text-secondary)', fontFamily: 'var(--font-body)' }}>
                            Email
                        </label>
                        <input
                            type="email"
                            value={form.email}
                            onChange={(e) => handleChange('email', e.target.value)}
                            className="w-full px-4 py-2.5 text-sm doodle-input"
                            style={{ color: 'var(--dd-text)' }}
                            placeholder="your@email.com"
                            required
                        />
                    </div>

                    <div className="mb-6">
                        <label className="block text-xs mb-1 font-bold tracking-wide uppercase"
                            style={{ color: 'var(--dd-text-secondary)', fontFamily: 'var(--font-body)' }}>
                            Password
                        </label>
                        <input
                            type="password"
                            value={form.password}
                            onChange={(e) => handleChange('password', e.target.value)}
                            className="w-full px-4 py-2.5 text-sm doodle-input"
                            style={{ color: 'var(--dd-text)' }}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-full py-3 text-sm font-bold cursor-pointer transition-all duration-200 wiggle"
                        style={{
                            fontFamily: 'var(--font-sketch)',
                            fontSize: '16px',
                            background: loading ? 'var(--dd-border)' : 'var(--dd-primary)',
                            color: '#fff',
                            border: '2px solid transparent',
                            boxShadow: 'var(--dd-shadow-md)',
                            letterSpacing: '0.05em',
                        }}
                        onMouseOver={(e) => {
                            if (!loading) e.target.style.background = 'var(--dd-primary-light)';
                        }}
                        onMouseOut={(e) => {
                            if (!loading) e.target.style.background = 'var(--dd-primary)';
                        }}
                    >
                        {loading ? 'Connecting...' : isRegister ? 'Create Account ✨' : 'Sign In →'}
                    </button>

                    <div className="mt-5 text-center">
                        <span
                            className="text-sm cursor-pointer transition-colors"
                            style={{ color: 'var(--dd-text-secondary)', fontFamily: 'var(--font-sketch)' }}
                            onClick={() => { setIsRegister((v) => !v); setError(''); }}
                            onMouseOver={(e) => (e.target.style.color = 'var(--dd-primary)')}
                            onMouseOut={(e) => (e.target.style.color = 'var(--dd-text-secondary)')}
                        >
                            {isRegister ? '← Already have an account?' : "Don't have an account? Join us! →"}
                        </span>
                    </div>
                </form>

                {/* Bottom scribble */}
                <div className="mt-6 text-center text-xs"
                    style={{ color: 'var(--dd-text-light)', fontFamily: 'var(--font-hand)', fontSize: '14px' }}>
                    ~ made with love ~
                </div>
            </div>
        </div>
    );
}
