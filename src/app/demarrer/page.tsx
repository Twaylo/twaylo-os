import { Sas } from "@/components/Sas";

export const metadata = {
  title: "Créer mon OS — Twaylo OS",
  description:
    "Six questions, deux minutes, et ton espace de travail est monté : journée type, habitudes, objectifs et compétences.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/demarrer" },
};

export default function Demarrer() {
  return <Sas />;
}
