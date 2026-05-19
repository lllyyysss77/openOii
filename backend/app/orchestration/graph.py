from __future__ import annotations

from langgraph.graph import END, StateGraph

from . import nodes
from .state import Phase2State


def build_phase2_graph() -> StateGraph:
    graph = StateGraph(Phase2State)

    # ---- Production nodes ----
    graph.add_node("plan_characters", nodes.plan_characters_node)
    graph.add_node("plan_shots", nodes.plan_shots_node)
    graph.add_node("render_characters", nodes.render_characters_node)
    graph.add_node("render_shots", nodes.render_shots_node)
    graph.add_node("compose_videos", nodes.compose_videos_node)
    graph.add_node("compose_merge", nodes.compose_merge_node)

    # ---- Approval nodes ----
    graph.add_node("characters_approval", nodes.characters_approval_node)
    graph.add_node("shots_approval", nodes.shots_approval_node)
    graph.add_node("character_images_approval", nodes.character_images_approval_node)
    graph.add_node("shot_images_approval", nodes.shot_images_approval_node)
    graph.add_node("compose_approval", nodes.compose_approval_node)

    # ---- Review node ----
    graph.add_node("review", nodes.review_node)

    # ---- Entry point (set by start_stage in runtime context) ----
    graph.set_conditional_entry_point(nodes.route_from_start)

    # ---- Linear flow: production → approval → next ----
    graph.add_edge("plan_characters", "characters_approval")
    graph.add_edge("plan_shots", "shots_approval")
    graph.add_edge("render_characters", "character_images_approval")
    graph.add_edge("render_shots", "shot_images_approval")
    graph.add_conditional_edges(
        "compose_videos",
        nodes.route_after_compose_videos,
        {"compose_merge": "compose_merge", END: END},
    )
    graph.add_conditional_edges(
        "compose_merge",
        nodes.route_after_compose_merge,
        {"compose_approval": "compose_approval", END: END},
    )

    # ---- Conditional edges after approvals (may route to review) ----
    graph.add_conditional_edges(
        "characters_approval",
        nodes.route_after_characters_approval,
        {"plan_shots": "plan_shots", "review": "review"},
    )
    graph.add_conditional_edges(
        "shots_approval",
        nodes.route_after_shots_approval,
        {"render_characters": "render_characters", "review": "review"},
    )
    graph.add_conditional_edges(
        "character_images_approval",
        nodes.route_after_character_images_approval,
        {"render_shots": "render_shots", "review": "review"},
    )
    graph.add_conditional_edges(
        "shot_images_approval",
        nodes.route_after_shot_images_approval,
        {"compose_videos": "compose_videos", "review": "review"},
    )
    graph.add_conditional_edges(
        "compose_approval",
        nodes.route_after_compose_approval,
        {END: END, "review": "review"},
    )

    # ---- Review routes back to production stages ----
    graph.add_conditional_edges(
        "review",
        nodes.route_after_review,
        {
            "plan_characters": "plan_characters",
            "render_characters": "render_characters",
            "compose_videos": "compose_videos",
        },
    )

    return graph


# Pre-built graph instance (used by tests)
phase2_graph = build_phase2_graph()
