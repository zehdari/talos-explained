#include "autonomy_test/autonomy_testing.hpp"

using namespace std::chrono_literals;

namespace {
nav_msgs::msg::Odometry odomAt(double z) {
    nav_msgs::msg::Odometry msg;
    msg.pose.pose.position.z = z;
    return msg;
}

std::shared_ptr<BT::TreeNode> deeperThan(std::shared_ptr<BtTestTool> tool, double z) {
    BT::NodeConfiguration cfg;
    cfg.input_ports["z"] = std::to_string(z);
    return tool->createLeafNodeFromConfig("DeeperThan", cfg);
}
}

TEST_F(BtTest, test_DeeperThan_fails_before_any_odometry) {
    auto node = deeperThan(toolNode, -0.5);
    ASSERT_EQ(node->executeTick(), BT::NodeStatus::FAILURE);
}

TEST_F(BtTest, test_DeeperThan_follows_depth) {
    auto node = deeperThan(toolNode, -0.5);
    auto pub = toolNode->create_publisher<nav_msgs::msg::Odometry>(ODOMETRY_TOPIC, 10);
    toolNode->spinForTime(0.3s); // discovery
    pub->publish(odomAt(-1.2));
    toolNode->spinForTime(0.2s);
    ASSERT_EQ(node->executeTick(), BT::NodeStatus::SUCCESS);
    pub->publish(odomAt(-0.3)); // above the limit
    toolNode->spinForTime(0.2s);
    ASSERT_EQ(node->executeTick(), BT::NodeStatus::FAILURE);
}

TEST_F(BtTest, test_DeeperThan_fails_on_stale_odometry) {
    auto node = deeperThan(toolNode, -0.5);
    auto pub = toolNode->create_publisher<nav_msgs::msg::Odometry>(ODOMETRY_TOPIC, 10);
    toolNode->spinForTime(0.3s);
    pub->publish(odomAt(-1.2));
    toolNode->spinForTime(0.2s);
    ASSERT_EQ(node->executeTick(), BT::NodeStatus::SUCCESS);
    toolNode->spinForTime(0.8s); // older than the default 0.5 s
    ASSERT_EQ(node->executeTick(), BT::NodeStatus::FAILURE);
}
