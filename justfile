
init dir:
  mkdir -p  {{ dir }}/.agents/.tickets \
            {{ dir }}/.agents/plans
  git -C {{ dir }}/.agents init
  stow -t {{ dir }} claude commands
  ln -s {{ dir }}/.agents/.tickets {{ dir }}/.tickets
  
