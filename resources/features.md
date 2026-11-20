Adventures:
• NexaGraph
    ○ UoB
    ○ PA
    ○ shipride [done]
• Embra Nexa
    ○ songs
    ○ cyberdeck
    ○ step sensor 2.0
• misc
    ○ Atomic Ballroom

panels
- action roadmap (cyto.graph_manager)
  - recommend actions
- classifier (3d-force-graph; cyto.nexagraph)
  - parents = filters
  - children = adventures
  - views/filters
    - pillars, desires, forces, demand signal
    - data source
    - key words
    - status
    - date
    - location, proximity
    - type
    - object associations (contacts, venues, etc)
    - prerequisites, pay walls, difficulty

- node card
  - status
  - element
  - description
  - cyto action graph?
  - rewards, skills, locked, difficulty, ROI
- spatial map
  - proximity
- temporal map
- logistics
  - feed status
  - crawler sync
  - image/card deck generator (comfy)
  - recommender algorithm
  - highlight modules by stage

- quest log - scrapes [bottlenecks / action items / atomic tasks] from high-priority adventures
  - modulate gradient of prioritization by equalizing demand signals
- analyzer - time-series

phases of adventure lifecycle
1. [discovery] - passthrough events from sources
  - "what do I want to do?"
  - <logistic.crawler_sync>
  - <classifier.event_sources>
  - <spatio-temporal_maps>
  - <node_card>
    - manual creation of adventures
2. [classification] - attach to virtual objects
  - "why do I want to do this?"
  - <node_card>
  - <classifier>
3. [metabolization/analysis/decomposition] - break down adventures into atomic actions
  - "how do I do this?"
  - <classifier>
  - <action_roadmap.scripter>
4. [construction] - build toward adventures by completing/eating through action roadmap
  - "what can I do right now?"
  - <classifier>
  - <action_roadmap.complete>
  - <quest_log>
5. [consumption] - adventure is complete; do it and capture feedback
  - "let's do this -> how did it go?"
  - <life>
  - <node_card>
* [*] - analysis of adventure evolution across entire lifecycle
  - "are we keeping pace?"
  - <analyzer>
  - <equalizer> - steering wheel; controller to direct attention/energy/focus/spirit
  - <entropy_market>