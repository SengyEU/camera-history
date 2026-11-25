(function (blocks, element, blockEditor, components, i18n) {
	"use strict";

	var el = element.createElement;
	var Fragment = element.Fragment;
	var InspectorControls = blockEditor.InspectorControls;
	var useBlockProps = blockEditor.useBlockProps;
	var PanelBody = components.PanelBody;
	var SelectControl = components.SelectControl;
	var TextControl = components.TextControl;
	var Notice = components.Notice;

	function targetOptions(type, data) {
		var items = type === "group" ? data.groups || [] : data.cameras || [];
		var options = [
			{
				label: type === "group" ? i18n.__("Select a group…", "camera-history") : i18n.__("Select a camera…", "camera-history"),
				value: "",
			},
		];
		items.forEach(function (item) {
			var suffix = type === "group" ? " (" + item.cameraCount + ")" : "";
			options.push({ label: item.name + suffix, value: item.slug });
		});
		return options;
	}

	function previewUrl(attributes, data) {
		if (!data.tenantSlug || !attributes.slug) return "";
		var type = attributes.type === "group" ? "group" : "camera";
		var url =
			(data.apiUrl || "https://camera-history.com").replace(/\/+$/, "") +
			(type === "group" ? "/group/" : "/widget/") +
			encodeURIComponent(data.tenantSlug) +
			"/" +
			encodeURIComponent(attributes.slug);
		if (attributes.theme) {
			url += "?theme=" + encodeURIComponent(attributes.theme);
		}
		return url;
	}

	blocks.registerBlockType("camera-history/widget", {
		apiVersion: 2,
		supports: { layout: true },
		title: i18n.__("Camera History", "camera-history"),
		description: i18n.__("Embed a camera history or a group switcher.", "camera-history"),
		icon: "camera",
		category: "widgets",
		keywords: [i18n.__("camera", "camera-history"), i18n.__("history", "camera-history")],
		attributes: {
			type: { type: "string", default: "camera" },
			slug: { type: "string", default: "" },
			width: { type: "string", default: "100%" },
			height: { type: "string", default: "720" },
			theme: { type: "string", default: "" },
		},
		edit: function (props) {
			var data = window.chBlockData || { cameras: [], groups: [], tenantSlug: "", apiUrl: "" };
			var blockProps = useBlockProps({ className: "ch-block-preview" });
			var type = props.attributes.type || "camera";
			var target = type === "group" ? "Group" : "Camera";
			var hasTargets = (type === "group" ? data.groups : data.cameras || []).length > 0;
			var src = previewUrl(props.attributes, data);

			return el(
				Fragment,
				{},
				el(
					InspectorControls,
					{},
					el(
						PanelBody,
						{ title: i18n.__("Camera History", "camera-history"), initialOpen: true },
						el(SelectControl, {
							label: i18n.__("Type", "camera-history"),
							value: type,
							options: [
								{ label: i18n.__("Camera", "camera-history"), value: "camera" },
								{ label: i18n.__("Group", "camera-history"), value: "group" },
							],
							onChange: function (value) {
								props.setAttributes({ type: value, slug: "" });
							},
						}),
						el(SelectControl, {
							label: target,
							value: props.attributes.slug,
							options: targetOptions(type, data),
							onChange: function (value) {
								props.setAttributes({ slug: value });
							},
						}),
						el(TextControl, {
							label: i18n.__("Width", "camera-history"),
							value: props.attributes.width,
							onChange: function (value) {
								props.setAttributes({ width: value });
							},
						}),
						el(TextControl, {
							label: i18n.__("Height fallback", "camera-history"),
							value: props.attributes.height,
							onChange: function (value) {
								props.setAttributes({ height: value });
							},
						}),
						el(SelectControl, {
							label: i18n.__("Theme", "camera-history"),
							value: props.attributes.theme,
							options: [
								{ label: i18n.__("Camera default", "camera-history"), value: "" },
								{ label: i18n.__("Light", "camera-history"), value: "light" },
								{ label: i18n.__("Dark", "camera-history"), value: "dark" },
								{ label: i18n.__("Forest", "camera-history"), value: "forest" },
								{ label: i18n.__("Midnight", "camera-history"), value: "midnight" },
							],
							onChange: function (value) {
								props.setAttributes({ theme: value });
							},
						})
					)
				),
				el(
					"div",
					blockProps,
					data.error ? el(Notice, { status: "warning", isDismissible: false }, data.error) : null,
					!data.tenantSlug
						? el(
								Notice,
								{ status: "warning", isDismissible: false },
								i18n.__("Set your workspace slug in Camera History → Settings.", "camera-history")
							)
						: null,
					!hasTargets
						? el(
								"p",
								{ className: "ch-block-empty" },
								i18n.__(
									"No cameras or groups found. Check the workspace slug in Camera History → Settings.",
									"camera-history"
								)
							)
						: null,
					src
						? el("iframe", {
								src: src,
								width: "100%",
								height: props.attributes.height || "720",
								style: { border: 0 },
								title: i18n.__("Camera History preview", "camera-history"),
								loading: "lazy",
							})
						: el(
								"p",
								{ className: "ch-block-empty" },
								i18n.__("Select a camera or group in the sidebar.", "camera-history")
							)
				)
			);
		},
		save: function () {
			return null;
		},
	});
})(window.wp.blocks, window.wp.element, window.wp.blockEditor, window.wp.components, window.wp.i18n);
