// Stand-in for the photography panel in the Figma reference. Shipped code
// shouldn't hotlink scraped stock photos, so this is a designed
// gradient/pattern surface instead — swap the <div> below for your own
// product photography (a simple <img className="..." src="..." /> works
// the same way) whenever you have real assets.
export default function AuthSidePanel({ heading, subheading }: { heading: string; subheading: string }) {
  return (
    <div className="hidden md:flex relative flex-col justify-end overflow-hidden bg-steel p-10 text-white">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, #3B5BA9 0%, transparent 40%), radial-gradient(circle at 80% 70%, #2F5FE0 0%, transparent 45%)',
        }}
      />
      <svg className="absolute top-10 right-10 opacity-20" width="220" height="220" viewBox="0 0 220 220" fill="none">
        <circle cx="110" cy="110" r="109" stroke="white" strokeWidth="1" />
        <circle cx="110" cy="110" r="70" stroke="white" strokeWidth="1" />
      </svg>
      <div className="relative">
        <p className="font-display text-3xl font-800 leading-tight mb-3">{heading}</p>
        <p className="text-white/70 text-sm max-w-xs">{subheading}</p>
      </div>
    </div>
  );
}
