@echo off
cd /d F:\allmeta\oa68k
set OA68K_NODE=pc1
set OA68K_DATA=F:\allmeta\oa68k\data
set OA68K_NODES_SHARING_KEY=3
python harvest.py --limit 40000 --shard-id 0 --shard-count 3 --workers 8 >> data\harvest_shard0.log 2>&1
