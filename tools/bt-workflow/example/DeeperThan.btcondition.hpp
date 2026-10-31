#pragma once

#include "riptide_autonomy/autonomy_lib.hpp"

/**
 * @brief SUCCESS while Talos is deeper than `z` (odometry z: 0 at the surface, negative below it).
 * FAILURE before any odometry arrives, or when the newest is older than `max_age_secs`.
 * It answers at once, so a ReactiveSequence can use it to guard a running subtree.
 */
class DeeperThan : public UWRTConditionNode {
    public:
    DeeperThan(const std::string& name, const BT::NodeConfiguration& config)
    : UWRTConditionNode(name, config) {

    }

    static BT::PortsList providedPorts() {
        return {
            UwrtInput("z", "Succeed while odometry z is below this (m, negative underwater)"),
            UwrtInput("max_age_secs", "Fail if the newest odometry is older than this (default 0.5)")
        };
    }

    void rosInit() override {
        odomSub = rosNode()->create_subscription<nav_msgs::msg::Odometry>(
            ODOMETRY_TOPIC,
            10,
            [this](const nav_msgs::msg::Odometry::SharedPtr msg) {
                lastZ = msg->pose.pose.position.z;
                lastStamp = rosNode()->get_clock()->now();
                haveOdom = true;
            });
    }

    BT::NodeStatus tick() override {
        const double z = tryGetRequiredInput<double>(this, "z", 0.0);
        const double maxAge = tryGetOptionalInput<double>(this, "max_age_secs", 0.5);
        if(!haveOdom || (rosNode()->get_clock()->now() - lastStamp).seconds() > maxAge) {
            return BT::NodeStatus::FAILURE;
        }
        return (lastZ < z) ? BT::NodeStatus::SUCCESS : BT::NodeStatus::FAILURE;
    }

    private:
    bool haveOdom = false;
    double lastZ = 0;
    rclcpp::Time lastStamp;
    rclcpp::Subscription<nav_msgs::msg::Odometry>::SharedPtr odomSub;
};
