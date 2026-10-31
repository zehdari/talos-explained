// Cross-check for extract.py: build a tree file with the real BT.CPP factory and riptide_autonomy's plugins (no ROS
// init: nodes only get their ROS handle in doTask's initRosForTree) and count the node instances by type.
//   g++ -std=c++17 count_nodes.cpp -I/opt/ros/humble/include/behaviortree_cpp_v3 -L/opt/ros/humble/lib \
//       -lbehaviortree_cpp_v3 -o /tmp/count_nodes
//   source /opt/ros/humble/setup.bash; source ~/osu-uwrt/release/install/setup.bash
//   /tmp/count_nodes ~/osu-uwrt/release/install/riptide_autonomy2/lib trees/RepairCompMpcTree.xml
#include <behaviortree_cpp_v3/bt_factory.h>
#include <iostream>
#include <map>

int main(int argc, char **argv) {
    if (argc < 3) return 1;
    BT::BehaviorTreeFactory factory;
    const std::string lib = argv[1];
    for (const char *p : {"/libautonomy_actions.so", "/libautonomy_conditions.so", "/libautonomy_decorators.so"})
        factory.registerFromPlugin(lib + p);
    auto tree = factory.createTreeFromFile(argv[2]);
    std::map<std::string, int> count;
    for (auto &n : tree.nodes) count[n->registrationName()]++;
    std::cout << "total " << tree.nodes.size() << " blackboards " << tree.blackboard_stack.size() << "\n";
    for (auto &[k, v] : count) std::cout << k << " " << v << "\n";
}
