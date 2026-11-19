# Sourced by setup.sh and v0/setup-v0.sh before they build anything. It refuses
# a deploy that could not be traced back to one public commit, and sets COMMIT
# to that commit's full id for the scripts to stamp on what they deploy.
# History: docs/decisions.md#deploy-commit
#
# A deploy is built from the folder it is run in, not from GitHub, so what runs
# is only as traceable as that folder is clean. The checks, in order:
#   - the branch is main: work lands on main first and is deployed from there;
#   - no tracked file differs from the commit, staged or not;
#   - no untracked file outside research/, which neither image ever copies
#     (.gcloudignore drops it for production, v0's Dockerfile names its paths);
#   - the commit is on origin/main, so a visitor can open the id that runs.
#     ALLOW_UNPUSHED=1 skips only this last check, and says so.

# The branch.
DEPLOY_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$DEPLOY_BRANCH" != main ]; then
  echo "REFUSING: deploys come from main, and this folder is on $DEPLOY_BRANCH." >&2
  exit 1
fi

# Tracked changes, staged or not.
if ! git diff --quiet HEAD --; then
  echo "REFUSING: tracked files differ from the commit. Commit or stash them first:" >&2
  git status --short --untracked-files=no >&2
  exit 1
fi

# Untracked files that would reach an image.
DEPLOY_UNTRACKED=$(git ls-files --others --exclude-standard | grep -v '^research/' || true)
if [ -n "$DEPLOY_UNTRACKED" ]; then
  echo "REFUSING: untracked files would be uploaded with the build:" >&2
  echo "$DEPLOY_UNTRACKED" >&2
  exit 1
fi

# The commit is public.
COMMIT=$(git rev-parse HEAD)
if ! git merge-base --is-ancestor "$COMMIT" origin/main 2>/dev/null; then
  if [ "${ALLOW_UNPUSHED:-}" = 1 ]; then
    echo "WARNING: $COMMIT is not on origin/main yet; deploying it anyway (ALLOW_UNPUSHED=1)." >&2
  else
    echo "REFUSING: $COMMIT is not on origin/main, so nobody outside this laptop can see it." >&2
    echo "Push main first, or set ALLOW_UNPUSHED=1 to deploy it and push after." >&2
    exit 1
  fi
fi
echo "Deploying commit $COMMIT."
