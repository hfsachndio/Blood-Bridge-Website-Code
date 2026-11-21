import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Camera, Clock3, IdCard, ShieldCheck, XCircle, CheckCircle2, LogOut } from "lucide-react";
import { AREAS, BLOOD_TYPES, type BloodType } from "../lib/blood";
import { logOut, submitForVerification, updateProfile, useCurrentUser, useReady, type User } from "../lib/store";
import { Loading, Logo } from "../components/Layout";
import { toast, toastError } from "../components/ui";
import { CnicCheck, type CnicCheckResult } from "../components/CnicCheck";

const formatCnic = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 13);
  return [d.slice(0, 5), d.slice(5, 12), d.slice(12)].filter(Boolean).join("-");
};
/** Shrinks the CNIC photo before saving so it fits in browser storage. */
async function compress(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const scale = Math.min(1, 640 / img.width);
  const c = document.createElement("canvas"); c.width = img.width * scale; c.height = img.height * scale;
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL("image/jpeg", 0.75);
}

export function ProfileForm({ me, mode, onDone }: { me: User; mode: "setup" | "edit"; onDone: () => void }) {
  const [f, setF] = useState({
    fullName: me.fullName, phone: me.phone ?? "", bloodType: (me.bloodType ?? "") as BloodType | "", dateOfBirth: me.dateOfBirth ?? "", gender: me.gender ?? "",
    weight: me.weight ? String(me.weight) : "", location: me.location ?? "", cnicNumber: me.cnicNumber ?? "", lastDonationDate: me.lastDonationDate ?? "",
  });
  const [cnicImage, setCnicImage] = useState(me.cnicImage ?? "");
  const [cnicCheck, setCnicCheck] = useState<CnicCheckResult | null>(me.cnicCheck ?? null);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const age = f.dateOfBirth ? Math.floor((Date.now() - new Date(f.dateOfBirth).getTime()) / 31557600000) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.bloodType) return toastError("Please choose your blood type.");
    if (!/^\d{5}-\d{7}-\d$/.test(f.cnicNumber)) return toastError("CNIC must be in the format 12345-1234567-1.");
    if (age !== null && age < 16) return toastError("You must be at least 16 to register.");
    if (mode === "setup" && !cnicImage) return toastError("Please upload a photo of the front of your CNIC.");
    const patch: Partial<User> = {
      fullName: f.fullName.trim(), phone: f.phone, bloodType: f.bloodType, dateOfBirth: f.dateOfBirth, gender: f.gender, weight: Number(f.weight) || 0,
      location: f.location, cnicNumber: f.cnicNumber, cnicImage, ...(f.lastDonationDate ? { lastDonationDate: f.lastDonationDate } : {}), ...(cnicCheck ? { cnicCheck: { ...cnicCheck, matchesTyped: cnicCheck.cnic ? cnicCheck.cnic === f.cnicNumber : null } } : {}),
    };
    if (mode === "setup") { submitForVerification(patch); toast("Submitted for verification", "We'll notify you once an admin approves your CNIC."); }
    else { updateProfile(patch); toast("Profile updated"); }
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="card p-5">
        <h2 className="font-semibold">Personal details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="pf-name">Full name</label><input id="pf-name" className="input" value={f.fullName} onChange={(e) => set("fullName")(e.target.value)} required /></div>
          <div><label className="label" htmlFor="pf-phone">Mobile number</label><input id="pf-phone" className="input" value={f.phone} onChange={(e) => set("phone")(e.target.value)} placeholder="0300-1234567" /></div>
          <div><label className="label" htmlFor="pf-dob">Date of birth</label><input id="pf-dob" type="date" className="input" value={f.dateOfBirth} onChange={(e) => set("dateOfBirth")(e.target.value)} max={new Date().toISOString().slice(0, 10)} required />{age !== null ? <p className="mt-1 text-xs text-gray-500">Age {age}</p> : null}</div>
          <div><label className="label" htmlFor="pf-gender">Gender</label><select id="pf-gender" className="input" value={f.gender} onChange={(e) => set("gender")(e.target.value)} required><option value="">Select…</option><option>Female</option><option>Male</option><option>Prefer not to say</option></select></div>
          <div><label className="label" htmlFor="pf-weight">Weight (kg)</label><input id="pf-weight" type="number" min={30} max={200} className="input" value={f.weight} onChange={(e) => set("weight")(e.target.value)} required /></div>
          <div><label className="label" htmlFor="pf-area">Area</label><select id="pf-area" className="input" value={f.location} onChange={(e) => set("location")(e.target.value)} required><option value="">Select your area…</option>{AREAS.map((a) => <option key={a.name}>{a.name}</option>)}</select></div>
        </div>
      </section>
      <section className="card p-5">
        <h2 className="font-semibold">Blood type</h2>
        <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8" role="radiogroup" aria-label="Blood type">
          {BLOOD_TYPES.map((t) => <button type="button" role="radio" aria-checked={f.bloodType === t} key={t} onClick={() => set("bloodType")(t)} className={`rounded-xl border py-3 text-sm font-bold transition ${f.bloodType === t ? "border-brand-600 bg-brand-600 text-white" : "border-gray-200 hover:border-brand-300"}`}>{t}</button>)}
        </div>
        <div className="mt-4 max-w-xs"><label className="label" htmlFor="pf-last">Last donation (optional)</label><input id="pf-last" type="date" className="input" value={f.lastDonationDate} onChange={(e) => set("lastDonationDate")(e.target.value)} max={new Date().toISOString().slice(0, 10)} /></div>
      </section>
      <section className="card p-5">
        <div className="flex items-center gap-2"><IdCard className="size-5 text-brand-600" /><h2 className="font-semibold">CNIC verification</h2></div>
        <p className="mt-1 text-sm text-gray-500">Required so only real, verified people can post or respond. Your CNIC is visible to administrators only.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="pf-cnic">CNIC number</label><input id="pf-cnic" className="input font-mono" inputMode="numeric" value={f.cnicNumber} onChange={(e) => set("cnicNumber")(formatCnic(e.target.value))} placeholder="42101-1234567-1" required /></div>
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 p-3 hover:border-brand-300">
            {cnicImage ? <img src={cnicImage} alt="CNIC preview" className="h-16 w-24 rounded-lg object-cover" /> : <span className="grid h-16 w-24 place-items-center rounded-lg bg-gray-50 text-gray-400"><Camera className="size-6" /></span>}
            <span className="text-sm"><b>{cnicImage ? "Change photo" : "Upload CNIC photo"}</b><br /><span className="text-gray-500">Front side, JPG or PNG</span></span>
            <input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { try { setCnicImage(await compress(file)); } catch { toastError("Couldn't read that image."); } } }} />
          </label>
        </div>
        <CnicCheck image={cnicImage} typed={f.cnicNumber} onResult={setCnicCheck} onUseNumber={(c) => set("cnicNumber")(c)} onUseDob={(d) => set("dateOfBirth")(d)} />
      </section>
      <button type="submit" className="btn-primary w-full py-3 sm:w-auto sm:px-8">{mode === "setup" ? "Submit for verification" : "Save changes"}</button>
    </form>
  );
}

export function ProfileSetup() {
  const me = useCurrentUser();
  const ready = useReady();
  const navigate = useNavigate();
  if (!ready) return <Loading />;
  if (!me) return <Navigate to="/login" replace />;
  if (me.status === "approved") return <Navigate to="/app" replace />;
  if (me.status === "pending") return <Navigate to="/status" replace />;
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-100 bg-white"><div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4"><Logo /><button onClick={() => { logOut(); navigate("/"); }} className="btn-ghost px-3 py-2 text-xs"><LogOut className="size-4" />Log out</button></div></header>
      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-2xl font-extrabold tracking-tight">Complete your donor profile</h1>
        <p className="mt-1 text-gray-500">{me.status === "rejected" ? "Your last submission was rejected. Please check your CNIC details and try again." : "Step 2 of 3: your details, blood type and CNIC."}</p>
        <div className="mt-6"><ProfileForm me={me} mode="setup" onDone={() => navigate("/status")} /></div>
      </main>
    </div>
  );
}

export function Status() {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const ready = useReady();
  useEffect(() => { if (me?.status === "approved") { toast("You're verified ✅", "Welcome to Blood Bridge!"); navigate("/app"); } }, [me?.status, navigate]);
  if (!ready) return <Loading />;
  if (!me) return <Navigate to="/login" replace />;
  const rejected = me.status === "rejected";
  return (
    <div className="grid min-h-screen place-items-center bg-gray-50 px-5">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="flex justify-center"><Logo /></div>
        <div className={`mx-auto mt-8 grid size-16 place-items-center rounded-full ${rejected ? "bg-brand-50 text-brand-600" : "bg-amber-50 text-amber-600"}`}>{rejected ? <XCircle className="size-8" /> : <Clock3 className="size-8 animate-pulse" />}</div>
        <h1 className="mt-5 text-2xl font-extrabold">{rejected ? "Verification rejected" : "Verification in progress"}</h1>
        <p className="mt-2 text-gray-500">{rejected ? "Your CNIC could not be verified. Update your details and submit again." : "An administrator is checking your CNIC. This page updates automatically once you're approved (a well-formed CNIC is usually verified automatically within a few seconds)."}</p>
        <ul className="mt-6 space-y-2 text-left text-sm">
          <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-green-600" />Account created</li>
          <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-green-600" />Profile and CNIC submitted</li>
          <li className="flex items-center gap-2">{rejected ? <XCircle className="size-4 text-brand-600" /> : <ShieldCheck className="size-4 text-amber-500" />}Admin review</li>
        </ul>
        <div className="mt-8 flex justify-center gap-2">
          {rejected ? <Link to="/profile/setup" className="btn-primary">Update details</Link> : null}
          <button onClick={() => { logOut(); navigate("/"); }} className="btn-ghost">Log out</button>
        </div>
      </div>
    </div>
  );
}
