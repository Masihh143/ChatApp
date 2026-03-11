import { useState } from 'react';

export default function AuthScreen({ onAuth }) {
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
            {/* Decorative doodles */}
            <div className="absolute top-[15%] left-[10%] text-6xl opacity-20 select-none" style={{ fontFamily: 'var(--font-hand)' }}>✿</div>
            <div className="absolute bottom-[20%] right-[12%] text-5xl opacity-15 select-none" style={{ fontFamily: 'var(--font-hand)' }}>☆</div>
            <div className="absolute top-[30%] right-[20%] text-4xl opacity-10 select-none" style={{ fontFamily: 'var(--font-hand)' }}>♡</div>
            <div className="absolute bottom-[35%] left-[15%] text-3xl opacity-15 select-none" style={{ fontFamily: 'var(--font-hand)' }}>~</div>

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
