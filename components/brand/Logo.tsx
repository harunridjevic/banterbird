import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

type LogoProps = {
  showWordmark?: boolean;
  className?: string;
  priority?: boolean;
};

export function Logo({
  showWordmark = true,
  className = "",
  priority = false,
}: LogoProps) {
  return (
    <Link href="/match" className={`group inline-flex flex-col items-center gap-1 ${className}`}>
      <motion.div
        whileHover={{ y: -2 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className="relative h-12 w-36 sm:h-14 sm:w-44"
      >
        <Image
          src="/banterbird-logo.png"
          alt="BanterBird"
          fill
          className="object-contain object-left"
          sizes="(max-width: 640px) 144px, 176px"
          priority={priority}
        />
      </motion.div>
      {!showWordmark ? (
        <span className="sr-only">BanterBird</span>
      ) : null}
    </Link>
  );
}

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <div className={`relative h-9 w-9 shrink-0 ${className}`}>
      <Image
        src="/banterbird-logo.png"
        alt=""
        fill
        className="object-contain"
        sizes="36px"
      />
    </div>
  );
}
