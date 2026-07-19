import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import Discord from "@auth/core/providers/discord";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google, GitHub, Discord],
  callbacks: {
    async redirect({ redirectTo }) {
      console.log(redirectTo);
      if (redirectTo.startsWith("cockpit://")) return redirectTo;
      if (redirectTo.startsWith("exp+")) return redirectTo;
      return "/";
    },
  },
});
