import { createContext, useContext, useState } from "react";

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(
    () => {
      const url = new URLSearchParams(window.location.search).get("lang");
      if (url) {
        // Un ?lang= en la URL (p. ej. desde un enlace de marketing) se aplica
        // UNA vez y se guarda. Luego se limpia de la barra de direcciones para
        // que los refrescos posteriores respeten la preferencia guardada en
        // vez de forzar siempre el idioma del enlace.
        localStorage.setItem("rhinoplan-lang", url);
        try {
          const u = new URL(window.location.href);
          u.searchParams.delete("lang");
          window.history.replaceState({}, "", u.pathname + u.search + u.hash);
        } catch (e) { /* si falla, no pasa nada: el idioma ya quedó guardado */ }
        return url;
      }
      return localStorage.getItem("rhinoplan-lang") || "es";
    }
  );

  const changeLang = (code) => {
    setLang(code);
    localStorage.setItem("rhinoplan-lang", code);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang: changeLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLang = () => useContext(LanguageContext);
