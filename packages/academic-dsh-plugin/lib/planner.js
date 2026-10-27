// packages/academic-dsh-plugin/src/planner.ts
var name = "academic-planner";
var inject = ["academicApp"];
function apply(ctx, config = {}) {
  ctx.effect(async () => {
    const app = await ctx.academicApp.appReady;
    const registration = app.registerPlannerCapability();
    if (config.log !== false) console.log("[academic-planner] capability registered");
    return () => {
      registration.dispose();
      if (config.log !== false) console.log("[academic-planner] capability released");
    };
  }, "academic-planner");
}
var planner_default = { name, inject, apply };
export {
  apply,
  planner_default as default,
  inject,
  name
};
