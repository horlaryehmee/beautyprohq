export function LumaSpin({ className = '', tone = 'dark' }) {
    const shadowClass = tone === 'light' ? 'shadow-white' : 'shadow-[#3A2A1F]';

    return (
        <div className={`relative aspect-square w-[65px] ${className}`} aria-hidden="true">
            <span className={`absolute rounded-[50px] shadow-[inset_0_0_0_3px] ${shadowClass} luma-spin-block`} />
            <span className={`absolute rounded-[50px] shadow-[inset_0_0_0_3px] ${shadowClass} luma-spin-block luma-spin-delay`} />
            <style>{`
                @keyframes lumaSpinLoader {
                    0% { inset: 0 35px 35px 0; }
                    12.5% { inset: 0 35px 0 0; }
                    25% { inset: 35px 35px 0 0; }
                    37.5% { inset: 35px 0 0 0; }
                    50% { inset: 35px 0 0 35px; }
                    62.5% { inset: 0 0 0 35px; }
                    75% { inset: 0 0 35px 35px; }
                    87.5% { inset: 0 0 35px 0; }
                    100% { inset: 0 35px 35px 0; }
                }
                .luma-spin-block {
                    animation: lumaSpinLoader 2.5s infinite;
                }
                .luma-spin-delay {
                    animation-delay: -1.25s;
                }
            `}</style>
        </div>
    );
}

export const Component = LumaSpin;

export default LumaSpin;
