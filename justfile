
_default:
  just --list

init dir:
  mkdir -p  {{ dir }}/.agents/.tickets \
            {{ dir }}/.agents/plans
  git -C {{ dir }}/.agents init
  stow -t {{ dir }} claude scripts
  ln -snf {{ dir }}/.agents/.tickets {{ dir }}/.tickets
  
