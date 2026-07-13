import tailwindcss from "tailwindcss-bun-plugin";

await Bun.build({
	entrypoints: ["index.html"],
	minify: true,
	outdir: "dist",
	plugins: [tailwindcss],
});
