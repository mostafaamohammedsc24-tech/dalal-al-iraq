import { Heart } from "lucide-react";
import { useLocation } from "wouter";
import { useFavorites } from "@/hooks/use-favorites";
import { cn } from "@/lib/utils";

export function FavoriteButton({
  listingId,
  className,
  size = "md",
}: {
  listingId: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const { isFavorite, toggle, enabled } = useFavorites();
  const [, navigate] = useLocation();
  const fav = isFavorite(listingId);
  const iconSize = size === "lg" ? "w-6 h-6" : size === "sm" ? "w-4 h-4" : "w-5 h-5";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!enabled) {
          navigate("/login");
          return;
        }
        toggle(listingId);
      }}
      aria-label={fav ? "إزالة من المفضلة" : "حفظ في المفضلة"}
      className={cn(
        "flex items-center justify-center rounded-full bg-white/90 dark:bg-gray-900/90 backdrop-blur shadow-sm hover:scale-110 transition p-2",
        className,
      )}
    >
      <Heart
        className={cn(iconSize, fav ? "fill-red-500 text-red-500" : "text-gray-500 dark:text-gray-300")}
      />
    </button>
  );
}
