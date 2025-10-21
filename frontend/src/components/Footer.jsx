import logo from '../assets/Data-Dribble-Logo-no-bg.png';

export default function Footer(){
    return  (
    <div className="flex flex-col items-center">
        <p className={`mt-10 mb-0 text-center text-xs uppercase tracking-[0.35em] text-slate-500`}>
                Crafted for hoop minds with an eye for detail
        </p>
    <img src={logo} className="mt-5 mb-5 h-30 w-30 mx-auto" alt="Data Dribble Logo" />
    </div>
    );
}
