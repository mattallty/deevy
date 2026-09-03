# Agents never approve Gates

A Gate is a workflow state an Issue cannot leave without approval. Agents get a fixed capability set: read and
write Issues in the Projects they are granted, comment, create and update Runs. They never administer the
Workspace, never manage Members, and never approve a Gate, even a Gate on an Issue they did not work on. An Agent
recommends in its Run summary; a Human approves. This is the structural rule from the AI-native SDLC playbook: the
party that proposes has no route to approve.

## Considered options

- **Same role system as Humans.** An admin Agent could approve anything. Rejected.
- **A designated verifier Agent may approve Gates it did not work on.** More flexible; opens the proposer-approver
  hole one configuration mistake at a time. Revisit once Runs and Gates exist and the demand is concrete.
