/** Minimal history router for the static site. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";

export const ROUTES = [
  "/",
  "/photo",
  "/mars-samples",
  "/data-layers",
  "/how-it-works",
] as const;

export type Route = (typeof ROUTES)[number];

export const ROUTE_DESCRIPTIONS: Record<Route, string> = {
  "/": "Explore similar environments with TerraTwin.",
  "/photo": "Find similar landscapes in sampled worldwide satellite images, and open a picture for each result.",
  "/mars-samples": "Browse Mars sample places, rocks, stories, and paired samples.",
  "/data-layers": "Explore the measured terrain layers behind the results.",
  "/how-it-works": "Learn what TerraTwin does, where it covers, and what it does not claim.",
};

export const ROUTE_TITLES: Record<Route, string> = {
  "/": "Home",
  "/photo": "Find a place",
  "/mars-samples": "Mars samples",
  "/data-layers": "Explore",
  "/how-it-works": "How it works",
};

const LEGACY_ROUTES: Record<string, Route> = {
  "/evidence": "/how-it-works",
  "/methodology": "/how-it-works",
  "/roadmap": "/how-it-works",
  "/about": "/how-it-works",
};

function normalize(pathname: string): Route {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (LEGACY_ROUTES[p]) return LEGACY_ROUTES[p];
  return (ROUTES as readonly string[]).includes(p) ? (p as Route) : "/";
}

interface RouterValue {
  route: Route;
  go: (to: Route) => void;
}

const RouterContext = createContext<RouterValue>({ route: "/", go: () => {} });

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => normalize(window.location.pathname));

  useEffect(() => {
    const onPop = () => setRoute(normalize(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = useCallback((to: Route) => {
    if (to !== normalize(window.location.pathname)) window.history.pushState({}, "", to);
    setRoute(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const value = useMemo(() => ({ route, go }), [route, go]);

  useEffect(() => {
    document.title = `${ROUTE_TITLES[route]} - TerraTwin`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", ROUTE_DESCRIPTIONS[route]);
  }, [route]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  return useContext(RouterContext);
}

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: Route;
}

export function Link({ to, onClick, ...rest }: LinkProps) {
  const { go } = useRouter();
  return (
    <a
      href={to}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        go(to);
        onClick?.(e);
      }}
      {...rest}
    />
  );
}
