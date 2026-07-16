import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getUser } from "@/lib/api";

export function useFavorites() {
  const qc = useQueryClient();
  const enabled = !!getUser();

  const { data } = useQuery({
    queryKey: ["favorites", "ids"],
    queryFn: () => api.get<{ ids: string[] }>("/favorites/ids"),
    enabled,
    staleTime: 60_000,
  });

  const ids = new Set(data?.ids ?? []);

  const add = useMutation({
    mutationFn: (id: string) => api.post(`/favorites/${id}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/favorites/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });

  return {
    enabled,
    ids,
    isFavorite: (id: string) => ids.has(id),
    toggle: (id: string) => (ids.has(id) ? remove.mutate(id) : add.mutate(id)),
  };
}
