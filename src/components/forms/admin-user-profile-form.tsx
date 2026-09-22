import { Field, SubmitButton } from "@/components/field";
import { updateUserProfile } from "@/lib/actions/admin";

export function AdminUserProfileForm({
  clientId,
  userId,
  firstName,
  lastName,
  companyName,
  phone,
  email,
}: {
  clientId: string;
  userId: string;
  firstName: string;
  lastName: string;
  companyName: string;
  phone: string;
  email: string;
}) {
  return (
    <form action={updateUserProfile} className="flex flex-col gap-4" autoComplete="off">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="userId" value={userId} />
      <p className="text-sm leading-6 text-[#8e8e93]">
        Same fields this login edits on Account. Company is the shared client company.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field id="firstName" label="First name" defaultValue={firstName} required autoComplete="off" />
        <Field id="lastName" label="Last name" defaultValue={lastName} required autoComplete="off" />
      </div>
      <Field id="companyName" label="Company name" defaultValue={companyName} required autoComplete="off" />
      <Field id="phone" label="Phone number" type="tel" defaultValue={phone} required autoComplete="off" />
      <div className="flex flex-col gap-2">
        <Field id="email" label="Email" type="email" defaultValue={email} required autoComplete="off" />
        <p className="text-sm leading-6 text-[#8e8e93]">
          This is their sign-in email. Saving a new address updates the login. It is separate from
          Primary contact email on Client info. They sign in with the new address next time; an open
          session stays signed in.
        </p>
      </div>
      <SubmitButton>Save profile</SubmitButton>
    </form>
  );
}
