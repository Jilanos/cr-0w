# CI secrets and protected variables

- Writing secrets (GitLab CI variables, Secrets Manager values) is blocked for the agent by the auto-mode classifier. Don't work around it:
  write a script to the scratchpad that generates the values without printing them, and have the owner run it with `! bash <script>`.
  Expect the `!` run to go to the background after 120s; its output lands in the task output file.
- Env-scoped GitLab variables: when a feature goes live on prod, every variable it reads needs a `prod` scope, otherwise prod silently uses the `*` value (another env's credentials).
  Create them with `environment_scope=prod`, `protected=true`, `masked_and_hidden=true` (hidden can only be set at creation).
  Protected works only if the prod jobs run on protected refs (protected tags) and declare `environment: name: prod`.
- Amazon MQ (RabbitMQ): the Terraform `user` block is only applied when the broker is created. If a broker already exists, rotate the password on the broker first, then update the variable.
- Check before and after: `glab api "projects/:id/variables?per_page=100" | jq '.[] | {key, environment_scope, protected, masked, hidden}'`.
